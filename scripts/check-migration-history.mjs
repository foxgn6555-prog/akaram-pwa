#!/usr/bin/env node
/**
 * حارس انحراف سجل الترحيلات (انظر docs/migration-history.json).
 *
 * المشكلة التي يمنعها: ملف ترحيلة موجود في المستودع بمعرّف (اسم ملف) غير مسجَّل في
 * supabase_migrations.schema_migrations، لأن الإنتاج طبّقه مرة بمعرّف آخر. النتيجة أن
 * `supabase db push` يعده «غير مطبَّق» فيعيد تنفيذه — وبعض الملفات ليست آمنة التكرار
 * (مثل 20261117160000_permission_catalog_disbursements الذي يبدأ بـ delete من
 * permission_write_bindings).
 *
 * لا يتصل بأي قاعدة بيانات. يقارن فقط:
 *   ملفات supabase/migrations/*.sql  ⟷  لقطة docs/migration-history.json
 *
 * التشغيل:  npm run check:migrations
 * ترميز الخروج: 0 سليم · 1 انحراف يجب إصلاحه
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const SNAPSHOT = join(ROOT, 'docs', 'migration-history.json')

function fail(lines) {
  console.error('\n✖ فشل فحص سجل الترحيلات:\n')
  for (const l of lines) console.error('  ' + l)
  console.error(
    '\nالإصلاح: سجّل المعرّفات المحلية المفقودة في supabase_migrations.schema_migrations',
  )
  console.error(
    '(INSERT فقط، بلا إعادة تنفيذ الملفات) ثم حدّث اللقطة بأمر scripts/migration-history-snapshot.sql.\n',
  )
  process.exit(1)
}

let snapshot
try {
  snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
} catch (e) {
  fail([`تعذّر قراءة ${SNAPSHOT}: ${e.message}`])
}

const applied = new Set(snapshot.versions)
const knownProdOnly = new Set(snapshot.known_prod_only ?? [])
// صفوف إنتاج موثَّقة بلا نظير محلي (تطبيق من خارج المستودع أو صفّ عابر أُنشئ وحُذف)
const transientProdRows = new Set(Object.keys(snapshot.transient_prod_rows ?? {}))

// معرّف كل ملف = البادئة الرقمية قبل أول "_"
const local = new Map()
const duplicates = []
for (const file of readdirSync(MIGRATIONS)) {
  if (!file.endsWith('.sql')) continue
  const version = file.slice(0, file.indexOf('_'))
  if (!/^\d+$/.test(version)) {
    duplicates.push(`اسم ملف غير صالح (لا بادئة رقمية): ${file}`)
    continue
  }
  if (local.has(version)) duplicates.push(`معرّف مكرر ${version}: ${local.get(version)} و${file}`)
  local.set(version, file)
}

/**
 * معرّفات بديلة: ملف محلي باسم `X` طُبّق على الإنتاج بمعرّف طابع زمني مولّد.
 * إن لم تُذكر هنا، عدّه الحارس «غير مطبَّق» فيعيد `db push` تنفيذه — وهذا هو
 * الخطر الذي وُجد الحارس لأجله. اللقطة وحدها لا تكفي: يجب ربط الاسم بالاسم.
 */
const aliases = snapshot.aliases ?? {}
const unaliased = []
for (const [localVer, prodVer] of Object.entries(aliases)) {
  if (!applied.has(prodVer))
    unaliased.push(`الاسم البديل ${prodVer} (لـ${localVer}) غير مسجَّل في اللقطة`)
  if (!local.has(localVer)) unaliased.push(`الاسم البديل يشير إلى ملف غير موجود: ${localVer}`)
}

const aliasedLocal = new Set(Object.keys(aliases))
const localOnly = [...local.keys()].filter((v) => !applied.has(v) && !aliasedLocal.has(v)).sort()
// معرّفات الإنتاج الناتجة عن أسماء بديلة معروفة ليست «خارج المستودع» — لها نظير محلي
const aliasProdIds = new Set(Object.values(aliases))
const prodOnlyUnknown = [...applied]
  .filter(
    (v) =>
      !local.has(v) && !knownProdOnly.has(v) && !aliasProdIds.has(v) && !transientProdRows.has(v),
  )
  .sort()

const problems = [...duplicates, ...unaliased]
if (localOnly.length) {
  problems.push(`${localOnly.length} ملفاً محلياً غير مسجَّل في الإنتاج — db push سيعيد تنفيذه:`)
  for (const v of localOnly) problems.push(`    • ${local.get(v)}`)
}
if (prodOnlyUnknown.length) {
  problems.push(
    `${prodOnlyUnknown.length} صفاً في الإنتاج بلا ملف في المستودع (تطبيق من خارج المستودع؟):`,
  )
  for (const v of prodOnlyUnknown) problems.push(`    • ${v}`)
}

if (problems.length) fail(problems)

console.log(
  `✔ سجل الترحيلات متسق: ${local.size} ملفاً محلياً · ${applied.size} صفاً في الإنتاج · ` +
    `${knownProdOnly.size} معرّف إنتاج قديم معروف (نظيره مسجَّل) · 0 قابل لإعادة التنفيذ`,
)
