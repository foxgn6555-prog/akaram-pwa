#!/usr/bin/env node
/**
 * تطبيق المهاجرات على المشروع البعيد — متعدد المنصات (Windows · Linux · macOS)
 * الاستخدام:  npm run db:push        أو   npm run db:push -- --dry-run
 * يقرأ تلقائياً من .env.local: SUPABASE_PROJECT_REF · SUPABASE_DB_PASSWORD · SUPABASE_ACCESS_TOKEN
 * المصادقة: env token إن وُجد — وإلا جلسة npx supabase login (متصفح)
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── قراءة .env.local (بدون مكتبات خارجية) ──
const env = {}
try {
  for (const line of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !line.trim().startsWith('#')) {
      const value = m[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '')
      if (value !== '') env[m[1]] = value
    }
  }
} catch {
  console.error('⚠️ .env.local غير موجود — سأعتمد على متغيرات البيئة الحالية')
}

const REF = process.env.SUPABASE_PROJECT_REF ?? env.SUPABASE_PROJECT_REF
if (!REF) {
  console.error('❌ SUPABASE_PROJECT_REF مفقود — أضفه إلى .env.local (من رابط المشروع)')
  process.exit(1)
}

const runEnv = {
  ...process.env,
  SUPABASE_DB_PASSWORD: process.env.SUPABASE_DB_PASSWORD ?? env.SUPABASE_DB_PASSWORD ?? '',
  ...(process.env.SUPABASE_ACCESS_TOKEN ? {} : env.SUPABASE_ACCESS_TOKEN ? { SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN } : {}),
}
const extra = process.argv.slice(2)

const run = (args) => {
  const result = spawnSync('npx', ['supabase', ...args], {
    shell: true,
    stdio: 'inherit',
    env: runEnv,
    cwd: root,
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log(`① ربط المشروع: ${REF}`)
run(['link', '--project-ref', REF])

console.log('② حالة المهاجرات (المطبق/المعلق):')
try { run(['migration', 'list']) } catch { /* بعض الإصدارات تفشل هنا — ليست حرجة */ }

console.log('③ التطبيق: npx supabase db push')
run(['db', 'push', ...extra])

console.log('\n✅ اكتمل — تحقق: Dashboard → Database → Migrations')
console.log('   اختياري: فعّل custom_access_token_hook من Authentication → Hooks')
