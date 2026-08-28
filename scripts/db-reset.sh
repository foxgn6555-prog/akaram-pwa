#!/usr/bin/env bash
# إعادة بناء قاعدة البيانات المحلية من الصفر (كل المهاجرات بالترتيب)
set -euo pipefail
supabase db reset
echo "✅ قاعدة البيانات المحلية أُعيد بناؤها — 15 migration"
