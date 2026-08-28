#!/usr/bin/env bash
# توليد أنواع قاعدة البيانات من Supabase المحلي
set -euo pipefail
command -v supabase >/dev/null || { echo "❌ ثبّت Supabase CLI أولاً"; exit 1; }
supabase gen types typescript --local > src/types/database.types.ts
echo "✅ src/types/database.types.ts — مولّد"
