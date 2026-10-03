"""Train segmentation + customer-value models with hyperparameter tuning,
tracked and registered in the MLflow Model Registry.

Value prediction uses a leak-free time split: features from the observation
window (up to cutoff), target = spend in the future window.
"""
import os
# pin BLAS/joblib threads before sklearn imports — some Windows boxes hang in
# loky's physical-core probe (WinError 2). ponytail: raise if you have cores to spare.
os.environ.setdefault("LOKY_MAX_CPU_COUNT", "1")
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")
import pathlib

import mlflow
import mlflow.sklearn
import numpy as np
import pandas as pd
from mlflow.tracking import MlflowClient
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import RandomizedSearchCV, train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import HistGradientBoostingRegressor

from data import DATA, load_transactions
from features import rfm

FUTURE_DAYS = 180
N_SEGMENTS = 4
FEATURES = ["recency", "frequency", "monetary"]
SEG_MODEL, VALUE_MODEL = "crm-segmentation", "crm-value-model"

mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "sqlite:///mlflow.db"))

# value tiers: label segments by mean predicted value, best -> "Champions"
SEGMENT_NAMES = ["At risk", "Promising", "Loyal", "Champions"]


def main():
    tx = load_transactions()
    cutoff = tx["order_date"].max() - pd.Timedelta(days=FUTURE_DAYS)
    feats = rfm(tx, cutoff)
    future = tx[tx["order_date"] > cutoff].groupby("customer_id")["amount"].sum()
    feats["future_value"] = future.reindex(feats.index).fillna(0.0)

    mlflow.set_experiment("crm-analytics")

    # --- segmentation ---
    with mlflow.start_run(run_name="segmentation"):
        X = StandardScaler().fit_transform(np.log1p(feats[FEATURES]))
        km = KMeans(n_clusters=N_SEGMENTS, random_state=42, n_init=10).fit(X)
        feats["cluster"] = km.labels_
        mlflow.log_param("n_segments", N_SEGMENTS)
        mlflow.log_metric("inertia", float(km.inertia_))
        mlflow.sklearn.log_model(km, "model", registered_model_name=SEG_MODEL)

    # --- customer value prediction with tuning ---
    tr, te = train_test_split(feats, test_size=0.2, random_state=42)
    grid = {
        "learning_rate": [0.01, 0.05, 0.1],
        "max_iter": [100, 200, 500],
        "max_depth": [3, 5, 8],
        "min_samples_leaf": [2, 5, 10],
        "l2_regularization": [0.0, 0.1, 1.0]
    }
    with mlflow.start_run(run_name="value-prediction"):
        search = RandomizedSearchCV(
            HistGradientBoostingRegressor(random_state=42),
            grid, n_iter=50, cv=5, scoring="neg_mean_absolute_error",
            random_state=42, n_jobs=1,
        ).fit(tr[FEATURES], tr["future_value"])
        model = search.best_estimator_
        pred = model.predict(te[FEATURES])
        mae, r2 = mean_absolute_error(te["future_value"], pred), r2_score(te["future_value"], pred)
        mlflow.log_param("future_days", FUTURE_DAYS)
        mlflow.log_params(search.best_params_)
        mlflow.log_metric("cv_mae", -search.best_score_)
        mlflow.log_metric("mae", mae)
        mlflow.log_metric("r2", r2)
        mlflow.sklearn.log_model(model, "model", registered_model_name=VALUE_MODEL)
        print(f"best params: {search.best_params_}")
        print(f"value model: MAE={mae:.2f} R2={r2:.3f}")

    # name segments by their mean predicted value (data-driven, stable labels)
    feats["predicted_value"] = np.maximum(0, model.predict(feats[FEATURES])).round(2)
    order = feats.groupby("cluster")["predicted_value"].mean().sort_values().index
    label = {c: SEGMENT_NAMES[i] for i, c in enumerate(order)}
    feats["segment"] = feats["cluster"].map(label)

    feats.reset_index().to_parquet(DATA / "customers.parquet", index=False)
    _print_registry()
    print(f"wrote {DATA/'customers.parquet'}")


def _print_registry():
    client = MlflowClient()
    for name in (SEG_MODEL, VALUE_MODEL):
        v = max(client.search_model_versions(f"name='{name}'"), key=lambda x: int(x.version))
        print(f"registered {name} -> version {v.version}")


if __name__ == "__main__":
    main()
