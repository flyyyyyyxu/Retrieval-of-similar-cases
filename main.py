"""Vercel entrypoint; the local development entrypoint remains app.main:app."""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))

if os.environ.get("VERCEL"):
    # Vercel's application bundle is read-only. This is temporary demo storage,
    # not a durable database shared by instances.
    os.environ.setdefault("DB_PATH", "/tmp/qingan/app.db")

from app.main import app  # noqa: F401
