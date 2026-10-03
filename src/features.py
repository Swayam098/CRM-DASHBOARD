"""RFM feature engineering. Recency/Frequency/Monetary per customer as of a snapshot date."""
import pandas as pd


def rfm(transactions: pd.DataFrame, snapshot: pd.Timestamp) -> pd.DataFrame:
    """Compute RFM for transactions occurring on/before `snapshot`.

    recency   = days since last order (lower = more recent)
    frequency = number of orders
    monetary  = total spend
    """
    obs = transactions[transactions["order_date"] <= snapshot]
    g = obs.groupby("customer_id")
    out = pd.DataFrame({
        "recency": (snapshot - g["order_date"].max()).dt.days,
        "frequency": g["amount"].count(),
        "monetary": g["amount"].sum().round(2),
    })
    return out


def _demo():
    tx = pd.DataFrame({
        "customer_id": ["A", "A", "B"],
        "order_date": pd.to_datetime(["2026-01-01", "2026-01-11", "2026-01-05"]),
        "amount": [10.0, 30.0, 100.0],
    })
    r = rfm(tx, pd.Timestamp("2026-01-11"))
    assert r.loc["A", "recency"] == 0 and r.loc["B", "recency"] == 6
    assert r.loc["A", "frequency"] == 2 and r.loc["B", "frequency"] == 1
    assert r.loc["A", "monetary"] == 40.0 and r.loc["B", "monetary"] == 100.0
    print("features._demo ok")


if __name__ == "__main__":
    _demo()
