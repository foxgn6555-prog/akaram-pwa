#!/usr/bin/env bash
# مولّد هيكلة feature جديدة — يضمن الالتزام باتفاقية المجلد
# استعمال: npm run feature:new -- payroll-extra
set -euo pipefail
NAME="${1:-}"
if [ -z "$NAME" ]; then echo "الاستعمال: $0 <feature-name>"; exit 1; fi
DIR="src/features/$NAME"
mkdir -p "$DIR/hooks" "$DIR/schemas" "$DIR/components"

cat > "$DIR/types.ts" <<TYPES
/** أنواع ${NAME} — mirror لجدولها في supabase/migrations */
export interface ${NAME^} {
  id: string
  version: number
}
TYPES

cat > "$DIR/schemas/${NAME}.schema.ts" <<SCHEMA
/** Zod — عقود الإدخال لـ ${NAME} */
import { z } from 'zod'
export const ${NAME}Schema = z.object({})
SCHEMA

cat > "$DIR/index.ts" <<BARREL
/** Public API لميزة ${NAME} — الحدود (قانون 3) */
export * from './types'
BARREL

echo "✅ ${DIR} — أُنشئت. أضف: hooks + SDK + query-keys + صفحة البوابة"
