"""CRM Analytics API + static dashboard host.

Serves the frontend, exposes analytics endpoints (JWT-protected), and scores
customers live using the model pulled from the MLflow Model Registry.

Run: uvicorn src.api:app --reload
"""
import os
import pathlib
import sys
import subprocess

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))  # allow flat imports under `uvicorn src.api:app`

import jwt
import mlflow
import pandas as pd
from fastapi import Depends, FastAPI, Form, HTTPException, UploadFile, File, BackgroundTasks, Request
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from auth import authenticate, create_token, verify_token
from train import DATA, FEATURES, VALUE_MODEL

ROOT = pathlib.Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "sqlite:///mlflow.db"))

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="CRM Analytics")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
oauth2 = OAuth2PasswordBearer(tokenUrl="login")

_value_model = None
_model_info = {"name": VALUE_MODEL, "version": None, "loaded": False}


def _load_model():
    """Pull the latest registered value model + its run metrics. Non-fatal if absent."""
    global _value_model
    try:
        client = mlflow.tracking.MlflowClient()
        v = max(client.search_model_versions(f"name='{VALUE_MODEL}'"), key=lambda x: int(x.version))
        _value_model = mlflow.sklearn.load_model(f"models:/{VALUE_MODEL}/{v.version}")
        metrics = client.get_run(v.run_id).data.metrics
        _model_info.update(version=v.version, loaded=True,
                           mae=round(metrics.get("mae", 0), 2), r2=round(metrics.get("r2", 0), 3))
    except Exception as e:  # registry empty or unreachable — dashboard still serves data
        _model_info["error"] = str(e)


@app.on_event("startup")
def startup():
    _load_model()


def user(token: str = Depends(oauth2)) -> str:
    try:
        return verify_token(token)
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")


def customers() -> pd.DataFrame:
    path = DATA / "customers.parquet"
    if not path.exists():
        raise HTTPException(503, "No model artifacts. Run: python src/train.py")
    return pd.read_parquet(path)


def transactions() -> pd.DataFrame:
    return pd.read_parquet(DATA / "transactions.parquet")


@app.post("/login")
@limiter.limit("5/minute")
def login(request: Request, username: str = Form(...), password: str = Form(...)):
    if not authenticate(username, password):
        raise HTTPException(401, "Incorrect username or password")
    return {"access_token": create_token(username), "token_type": "bearer"}


@app.get("/api/summary")
def summary(_: str = Depends(user)):
    c, tx = customers(), transactions()
    return {
        "customers": int(len(c)),
        "transactions": int(len(tx)),
        "revenue": float(tx["amount"].sum()),
        "predicted_value": float(c["predicted_value"].sum()),
        "model": _model_info,
    }


@app.get("/api/segments")
def segments(_: str = Depends(user)):
    c = customers()
    g = c.groupby("segment").agg(
        customers=("customer_id", "size"),
        recency=("recency", "mean"),
        frequency=("frequency", "mean"),
        monetary=("monetary", "mean"),
        predicted_value=("predicted_value", "mean"),
        total_value=("predicted_value", "sum"),
    ).round(1)
    return g.reset_index().sort_values("predicted_value", ascending=False).to_dict("records")


@app.get("/api/customers")
def top_customers(_: str = Depends(user), limit: int = 25):
    c = customers().nlargest(limit, "predicted_value")
    cols = ["customer_id", "segment", "recency", "frequency", "monetary", "predicted_value"]
    return c[cols].to_dict("records")


@app.get("/api/scatter")
def scatter(_: str = Depends(user), n: int = 800):
    c = customers().sample(min(n, len(customers())), random_state=1)
    return c[["customer_id", "segment", "frequency", "monetary", "predicted_value"]].to_dict("records")


@app.get("/api/distribution")
def distribution(_: str = Depends(user), bins: int = 40):
    v = customers()["predicted_value"].clip(lower=0)
    # Filter top 1% extreme outliers to prevent the histogram from being crushed into one bin
    cap = v.quantile(0.99)
    v_capped = v[v <= cap]
    counts, edges = pd.cut(v_capped, bins=bins, retbins=True)
    hist = v_capped.groupby(counts, observed=False).size()
    return {"edges": [round(e, 2) for e in edges], "counts": [int(x) for x in hist], "cap": round(cap, 2)}


@app.get("/api/transactions")
def monthly(_: str = Depends(user)):
    tx = transactions().set_index("order_date").resample("ME")["amount"].agg(["sum", "size"])
    return [{"month": d.strftime("%Y-%m"), "revenue": round(r, 2), "orders": int(o)}
            for d, (r, o) in tx.iterrows()]


@app.post("/api/transaction")
@limiter.limit("30/minute")
def add_transaction(request: Request, background_tasks: BackgroundTasks, customer_id: str = Form(...), amount: float = Form(...),
                    order_date: str = Form(...), _: str = Depends(user)):
    """Append one transaction to the dataset. Retrain to refresh segments/predictions."""
    if amount <= 0:
        raise HTTPException(400, "amount must be positive")
    try:
        ts = pd.to_datetime(order_date)
    except Exception:
        raise HTTPException(400, "order_date must be a valid date")
    tx = transactions()
    tx.loc[len(tx)] = [customer_id.strip(), ts, round(amount, 2)]
    tx.sort_values("order_date").to_parquet(DATA / "transactions.parquet", index=False)
    
    # Trigger model retraining so the new transaction actually impacts ML values
    background_tasks.add_task(_retrain_and_reload)
    
    return {"ok": True, "transactions": int(len(tx))}


@app.post("/api/predict")
@limiter.limit("60/minute")
def predict(request: Request, recency: float = Form(...), frequency: float = Form(...),
            monetary: float = Form(...), _: str = Depends(user)):
    if not _model_info["loaded"]:
        raise HTTPException(503, "Value model not loaded. Run: python src/train.py")
    row = pd.DataFrame([[recency, frequency, monetary]], columns=FEATURES)
    val = max(0.0, float(_value_model.predict(row)[0]))
    return {"predicted_value": round(val, 2), "model": _model_info}


def _retrain_and_reload():
    subprocess.run([sys.executable, "src/train.py"])
    _load_model()


@app.post("/api/upload")
@limiter.limit("10/minute")
async def upload_file(request: Request, background_tasks: BackgroundTasks, file: UploadFile = File(...), _: str = Depends(user)):
    path = DATA / file.filename
    with open(path, "wb") as f:
        f.write(await file.read())

    if path.suffix in [".csv", ".parquet"]:
        df = pd.read_csv(path) if path.suffix == ".csv" else pd.read_parquet(path)
        
        # Auto-map Donor dataset to transactions if needed
        if "DonorID" in df.columns:
            rows = []
            default_date = pd.to_datetime("2023-01-01")
            for _, row in df.iterrows():
                cid = row.get("DonorID")
                gifts = int(row.get("TotalGifts", 1))
                amt = float(row.get("TotalAmountDonated", 0)) / gifts if gifts > 0 else 0
                date_val = row.get("LastDonationDate")
                date = pd.to_datetime(date_val) if pd.notnull(date_val) else default_date
                for i in range(gifts):
                    rows.append({
                        "customer_id": cid,
                        "order_date": date - pd.Timedelta(days=30*i),
                        "amount": round(amt, 2)
                    })
            df = pd.DataFrame(rows)
        
        if all(c in df.columns for c in ["customer_id", "order_date", "amount"]):
            df["order_date"] = pd.to_datetime(df["order_date"])
            df = df[["customer_id", "order_date", "amount"]]
            
            tx_path = DATA / "transactions.parquet"
            if tx_path.exists():
                existing_df = pd.read_parquet(tx_path)
                df = pd.concat([existing_df, df], ignore_index=True).drop_duplicates(subset=["customer_id", "order_date"])
                
            df = df.sort_values("order_date")
            df.to_parquet(tx_path, index=False)
            background_tasks.add_task(_retrain_and_reload)
            return {"ok": True, "filename": file.filename, "message": "Uploaded, merged, and retraining started."}

    return {"ok": True, "filename": file.filename, "message": "File saved."}

def _retrain_and_reload():
    try:
        res = subprocess.run([sys.executable, "src/train.py"], capture_output=True, text=True)
        if res.returncode != 0:
            print(f"train.py failed: {res.stderr}")
        _load_model()
    except Exception as e:
        print(f"retrain exception: {e}")

@app.get("/api/model")
def model(_: str = Depends(user)):
    return _model_info


# static frontend (auth enforced by the /api layer; JS gates the UI on the token)
@app.get("/")
def index():
    return FileResponse(FRONTEND / "index.html")


app.mount("/", StaticFiles(directory=FRONTEND), name="frontend")
