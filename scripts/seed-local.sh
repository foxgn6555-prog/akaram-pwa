#!/usr/bin/env bash
# بذر البيئة المحلية: تشغيل + seed
set -euo pipefail
supabase start
supabase db reset
psql "postgresql://postgres:postgres@localhost:54322/postgres" \
  -f supabase/seed/02_departments.sql
echo "✅ تم البذر — افتح Studio: http://localhost:54323"
echo "⚠️  أنشئ مستخدم admin من Studio ثم أعطه الدور (seed/01_roles.sql)"
