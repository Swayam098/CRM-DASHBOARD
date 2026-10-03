<h1 align="center">
  🚀 CRM Analytics Dashboard
</h1>

<p align="center">
  <strong>Advanced Customer Segmentation, Value Prediction, and ML Lifecycle Tracking</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10+-blue.svg" alt="Python Version">
  <img src="https://img.shields.io/badge/FastAPI-0.109+-00a393.svg" alt="FastAPI">
  <img src="https://img.shields.io/badge/MLflow-Tracking-FF69B4.svg" alt="MLflow">
  <img src="https://img.shields.io/badge/Security-SlowAPI-red.svg" alt="Security">
</p>

---

## 🌟 Overview

Welcome to the **CRM Analytics Dashboard**, an end-to-end Machine Learning platform for customer intelligence. This system ingests transaction data, segments customers using RFM analysis, and forecasts future spending using a state-of-the-art `HistGradientBoostingRegressor` engine. 

The entire Machine Learning lifecycle is fully automated, tracked, and registered via **MLflow**, and exposed through a secure, rate-limited **FastAPI** backend with a beautiful, modern Glassmorphism frontend.

---

## ✨ Key Features

- 🎯 **Intelligent Customer Segmentation**: Automatically groups customers into tiers (Champions, Loyal, Promising, At Risk) using K-Means clustering on RFM (Recency, Frequency, Monetary) data.
- 🔮 **Future Value Prediction**: Uses an advanced anti-overfitting `HistGradientBoostingRegressor` to predict exactly how much revenue a customer will generate in the next 6 months. Includes interactive hypothetical scoring.
- 📂 **Drag-and-Drop Dataset Retraining**: Upload `.csv` or `.parquet` transaction files directly through the UI. The server automatically cleans the data, re-trains the AI model in the background, and pushes the new version to production.
- 📈 **Dynamic Visualizations**: Beautiful, custom SVG charts showing revenue trends, predicted value distribution curves, and scatter plots.
- 🛡️ **Enterprise-Grade Security**: 
  - JWT token authentication for all endpoints.
  - Bruteforce protection and anti-spam via `slowapi` rate limiting.
  - Safe bounds checking (clipping impossible negative values).
- ⚙️ **Automated MLOps**: Seamless integration with MLflow Model Registry and a ready-to-use `Jenkinsfile` for CI/CD deployments.

---

## 🚀 Quickstart

### 1. Install Dependencies
```bash
pip install -r requirements.txt
pip install slowapi # Added for rate limiting
```

### 2. Initialize the AI Model
On the first run, this script will automatically synthesize dummy data, train the models, and register them in MLflow.
```bash
python src/train.py
```
*(Tip: Run it twice to see MLflow versioning in action!)*

### 3. Start the Server
```bash
uvicorn src.api:app --reload
```
Navigate to **http://localhost:8000** in your browser. 
**Default Login:** `admin` / `admin`

### 4. View MLflow Dashboard (Optional)
To inspect the model parameters, MAE, R², and model registry:
```bash
mlflow ui --backend-store-uri sqlite:///mlflow.db
```

---

## 🔧 Configuration

You can customize the application behavior via environment variables:

| Variable | Default Value | Description |
|----------|---------------|-------------|
| `MLFLOW_TRACKING_URI` | `sqlite:///mlflow.db` | Local or remote MLflow store URI |
| `ADMIN_USER` | `admin` | Dashboard login username |
| `ADMIN_PASSWORD` | `admin` | Dashboard login password |
| `JWT_SECRET` | `dev-secret-change-me` | **CHANGE IN PROD!** Secret for token signing |

---

## 📁 Project Architecture

```text
├── data/                 # Ignored by git; stores transactions & parquet artifacts
├── frontend/             # Beautiful HTML/CSS/JS frontend (no build step required)
│   ├── index.html        # Dashboard UI
│   ├── styles.css        # Core styling
│   ├── gradient-upload.css # Glassmorphism upload styles
│   └── app.js            # Frontend logic and API integration
├── src/
│   ├── api.py            # FastAPI server, endpoints, and security/rate-limiting
│   ├── auth.py           # JWT generation and verification
│   ├── data.py           # Synthetic data generation & loader
│   ├── features.py       # RFM feature engineering
│   └── train.py          # ML pipeline, tuning, and MLflow registry
├── Jenkinsfile           # Production CI/CD pipeline
├── requirements.txt      # Python dependencies
└── README.md             # Project documentation
```

---

## 📊 Bring Your Own Data

The system is designed to seamlessly adapt to your actual business data. 
You can simply use the **Upload Data** module on the dashboard, or manually drop a file into `data/transactions.csv` containing at least the following columns:
`customer_id`, `order_date`, `amount`.

*The AI will handle the rest!*
