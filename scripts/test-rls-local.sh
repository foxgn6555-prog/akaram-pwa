#!/usr/bin/env bash
# تشغيل جناح عزل البيانات على قاعدة محلية
# المتطلب: PostgreSQL محلي + قاعدة بها المهاجرات (أو supabase start)
set -euo pipefail
CONNECTION="${1:-postgresql://postgres:postgres@localhost:54322/postgres}"
psql "$CONNECTION" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql
