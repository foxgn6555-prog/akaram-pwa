#!/usr/bin/env bash
# تثبيت خطاف pre-commit: فحص الأسرار قبل كل commit
set -euo pipefail
cd "$(dirname "$0")/.."
git rev-parse --git-dir >/dev/null 2>&1 || { echo "❌ ليس مستودع git — شغّل: git init"; exit 1; }
HOOK="$(git rev-parse --git-dir)/hooks/pre-commit"
cat > "$HOOK" <<'HOOK'
#!/usr/bin/env bash
# مُثبَّت بواسطة scripts/install-git-hooks.sh — فحص الأسرار
bash scripts/check-secrets.sh
HOOK
chmod +x "$HOOK"
echo "✅ خطاف pre-commit مثبّت: $HOOK"
