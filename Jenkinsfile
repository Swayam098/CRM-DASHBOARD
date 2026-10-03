pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        MLFLOW_TRACKING_URI = "${env.MLFLOW_TRACKING_URI ?: 'sqlite:///mlflow.db'}"
        // set these as Jenkins credentials in real deployments, not defaults
        ADMIN_USER = "${env.ADMIN_USER ?: 'admin'}"
        ADMIN_PASSWORD = "${env.ADMIN_PASSWORD ?: 'admin'}"
        JWT_SECRET = "${env.JWT_SECRET ?: 'dev-secret-change-me'}"
    }

    stages {
        stage('Setup') {
            steps {
                sh '''
                    python -m venv .venv
                    . .venv/bin/activate
                    pip install --upgrade pip
                    pip install -r requirements.txt
                '''
            }
        }

        stage('Test') {
            steps {
                sh '. .venv/bin/activate && python src/features.py'
            }
        }

        stage('Data') {
            steps {
                sh '. .venv/bin/activate && python src/data.py'
            }
        }

        stage('Train + register (MLflow)') {
            steps {
                sh '. .venv/bin/activate && python src/train.py'
            }
        }

        stage('Deploy API + dashboard') {
            steps {
                // headless launch; swap for your process manager / container in real deploys
                sh '''
                    . .venv/bin/activate
                    nohup uvicorn src.api:app --host 0.0.0.0 --port 8000 > api.log 2>&1 &
                    echo "dashboard + API on :8000"
                '''
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'mlflow.db, mlartifacts/**, data/*.parquet, api.log', allowEmptyArchive: true
        }
    }
}
