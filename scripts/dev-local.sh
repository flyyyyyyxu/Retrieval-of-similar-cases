#!/usr/bin/env bash
# 本地真实案例离线演示：不调用外部模型或内网数据源。
set -euo pipefail
cd "$(dirname "$0")/../backend"
project_root="$(cd .. && pwd)"
source_file="${1:-$project_root/../../自有数据库/金融借款合同纠纷_2026-11-23/全部案件.json}"
uv run python ../scripts/import_local_cases.py "$source_file"
export CASE_SOURCE=mock
export FIXTURES_PATH="$project_root/var/local_cases.json"
export CASE_TYPE_CONFIG="$project_root/configs/financial_loan.yaml"
export DB_PATH="$project_root/var/local-demo.db"
export ANTHROPIC_API_KEY=''
export RERANK_URL=''
exec uv run uvicorn app.main:app --reload --host 127.0.0.1 --port "${PORT:-8000}"
