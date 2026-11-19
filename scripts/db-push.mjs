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

// ── حاجز ①: انحراف سجل الترحيلات ──────────────────────────────────────────────
// إن كان ملف محلي غير مسجَّل في سجل الإنتاج فسيُعاد تنفيذه الآن — وبعض الملفات ليست
// آمنة التكرار (20261117160000 يحذف permission_write_bindings). نوقف قبل أي لمس.
const drift = spawnSync('node', ['scripts/check-migration-history.mjs'], { stdio: 'inherit', cwd: root, shell: false })
if (drift.status !== 0) {
  console.error('❌ أُوقف الدفع: سجل الترحيلات غير متسق (انظر أعلاه). لم يُطبَّق شيء.')
  process.exit(drift.status ?? 1)
}

// ── حاجز ②: الإنتاج ليس هدفاً افتراضياً ──────────────────────────────────────
// التطبيق على قاعدة الإنتاج يجري بمراجعة SQL وتسجيل النسخة، لا بـ db push.
const PROD_REF = 'rzpitdsuwgprzfvrlkdn'
if (REF === PROD_REF && !extra.includes('--allow-production')) {
  console.error(`❌ أُوقف الدفع: ${REF} هو مشروع الإنتاج.`)
  console.error('   القاعدة: لا db push على الإنتاج. طبّق الترحيلة بمراجعة (SQL مسجَّل + صف في schema_migrations).')
  console.error('   إن كان الهدف اختبارياً فعلاً وأصررت: أضف --allow-production صريحاً.')
  process.exit(1)
}

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

console.log('② حالة المهاجرات البعيدة (المطبق/المعلق):')
run(['migration', 'list', '--remote'])

console.log('③ التطبيق على قاعدة المشروع البعيدة: npx supabase db push --remote')
run(['db', 'push', '--remote', ...extra])

console.log('\n✅ اكتمل — تحقق: Dashboard → Database → Migrations')
console.log('   اختياري: فعّل custom_access_token_hook من Authentication → Hooks')
