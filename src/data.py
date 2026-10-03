"""Transaction data loader.

Uses a real export when present, otherwise generates synthetic transactions so
the pipeline runs offline. A real export is a CSV/parquet at data/transactions.*
with columns: customer_id (str), order_date (date), amount (float).
"""
import pathlib

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
COLUMNS = ["customer_id", "order_date", "amount"]
RNG = np.random.default_rng(42)


def load_transactions() -> pd.DataFrame:
    """Return transactions from the first real export found."""
    for name in ("transactions.parquet", "transactions.csv"):
        path = DATA / name
        if path.exists():
            df = pd.read_parquet(path) if path.suffix == ".parquet" else pd.read_csv(path)
            missing = set(COLUMNS) - set(df.columns)
            if missing:
                raise ValueError(f"{path} missing columns: {sorted(missing)}")
            df["order_date"] = pd.to_datetime(df["order_date"])
            return df[COLUMNS].sort_values("order_date").reset_index(drop=True)

    raise FileNotFoundError("No transaction data found. Please upload a dataset (e.g. CSV) via the dashboard.")


if __name__ == "__main__":
    df = load_transactions()
    print(f"{len(df):,} transactions, {df.customer_id.nunique():,} customers, "
          f"{df.order_date.min().date()}..{df.order_date.max().date()}")
