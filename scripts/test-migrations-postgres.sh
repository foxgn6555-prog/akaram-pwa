#!/usr/bin/env bash
# قاعدة PostgreSQL خام وفارغة: محاكاة Supabase الأساسية ← كل migrations ← كل SQL tests.
set -euo pipefail
cd "$(dirname "$0")/.."

PSQL_BIN="${PSQL_BIN:-psql}"
ADMIN_URL="${TEST_DATABASE_ADMIN_URL:?ضع رابط قاعدة الإدارة، مثال postgresql://user@127.0.0.1:55432/postgres}"
DB_NAME="${TEST_DATABASE_NAME:-akaram_migration_test}"
DB_URL="${ADMIN_URL%/*}/$DB_NAME"

cleanup() {
  "$PSQL_BIN" "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "drop database if exists $DB_NAME with (force);" >/dev/null || true
}
trap cleanup EXIT

cleanup
"$PSQL_BIN" "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "create database $DB_NAME;" >/dev/null
"$PSQL_BIN" "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/local_supabase_prelude.sql >/dev/null

for migration in supabase/migrations/*.sql; do
  echo "APPLY $(basename "$migration")"
  "$PSQL_BIN" "$DB_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

# في Supabase تكون pgTAP متاحة كامتداد. في PostgreSQL الخام يجب تثبيت الحزمة أولاً.
if ! "$PSQL_BIN" "$DB_URL" -Atc "select to_regprocedure('plan(integer)') is not null" | grep -qx t; then
  if [[ -n "${PGTAP_SQL:-}" ]]; then
    "$PSQL_BIN" "$DB_URL" -v ON_ERROR_STOP=1 -f "$PGTAP_SQL" >/dev/null
  else
    "$PSQL_BIN" "$DB_URL" -v ON_ERROR_STOP=1 -c 'create extension if not exists pgtap' >/dev/null
  fi
fi

for test_file in \
  supabase/tests/smoke_schema.sql \
  supabase/tests/rls_policies.test.sql \
  supabase/tests/triggers.test.sql \
  supabase/tests/rpc_public_test.sql \
  supabase/tests/rls_isolation.sql \
  supabase/tests/round2_smoke.sql \
  supabase/tests/round6_isolation.sql \
  supabase/tests/complaints_isolation.sql \
  supabase/tests/complaints_workflow_isolation.sql \
  supabase/tests/complaints_end_to_end.sql
do
  echo "TEST $(basename "$test_file")"
  "$PSQL_BIN" "$DB_URL" -v ON_ERROR_STOP=1 -f "$test_file" >/dev/null
done

echo "✅ قاعدة فارغة: كل migrations وكل اختبارات SQL نجحت"
