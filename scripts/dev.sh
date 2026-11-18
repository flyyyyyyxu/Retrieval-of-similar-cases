#!/usr/bin/env bash
# 本地启动：后端 API + 前端页面，访问 http://127.0.0.1:8000
set -euo pipefail
cd "$(dirname "$0")/../backend"
uv sync
exec uv run uvicorn app.main:app --reload --host 127.0.0.1 --port "${PORT:-8000}"
