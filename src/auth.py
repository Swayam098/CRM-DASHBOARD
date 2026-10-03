"""Minimal JWT auth: one operator account from env, HS256 tokens.

ponytail: single env-configured user. Swap `authenticate` for a real user store
(hashed passwords in a DB) when you have more than one operator.
"""
import hmac
import os
import time

import jwt

SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin")
TTL_SECONDS = 12 * 3600


def authenticate(username: str, password: str) -> bool:
    ok_user = hmac.compare_digest(username, ADMIN_USER)
    ok_pass = hmac.compare_digest(password, ADMIN_PASSWORD)
    return ok_user and ok_pass


def create_token(username: str) -> str:
    now = int(time.time())
    return jwt.encode({"sub": username, "iat": now, "exp": now + TTL_SECONDS}, SECRET, algorithm="HS256")


def verify_token(token: str) -> str:
    """Return the username, or raise jwt.PyJWTError if invalid/expired."""
    return jwt.decode(token, SECRET, algorithms=["HS256"])["sub"]
