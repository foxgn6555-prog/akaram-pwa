/**
 * منطق أداة akaram-archive القابل للاختبار (بلا شبكة ولا قرص):
 *  - تحويل مسار التخزين إلى مسار محلي آمن على ويندوز/لينكس (والعودة عبر البيان manifest)
 *  - بناء/دمج البيان، حساب ما يلزم تنزيله، تجميع الدفعات، تلخيص التحقق
 */
import { createHash } from 'node:crypto'

// eslint-disable-next-line no-control-regex -- أحرف التحكم ممنوعة في أسماء ملفات ويندوز
const WIN_FORBIDDEN = /[<>:"|?*\u0000-\u001f]/g
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** مسار محلي آمن: يُستبدل كل حرف ممنوع بـ %XX ويُحمى من ../ والأسماء المحجوزة */
export function safeLocalPath(bucket, storagePath) {
  const parts = String(storagePath).split('/').filter((p) => p.length > 0 && p !== '.')
  const enc = parts.map((seg) => {
    let s = seg === '..' ? '%2E%2E' : seg.replace(WIN_FORBIDDEN, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))
    if (WIN_RESERVED.test(s)) s = '_' + s
    if (/[. ]$/.test(s)) s = s.replace(/[. ]+$/, (m) => m.split('').map((c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()).join(''))
    return s
  })
  return ['files', safeBucket(bucket), ...enc].join('/')
}
export const safeBucket = (b) => String(b).replace(/[^a-zA-Z0-9_-]/g, '_')

export const sha256Hex = (buf) => createHash('sha256').update(buf).digest('hex')
export const isSha256 = (s) => /^[0-9a-f]{64}$/.test(String(s ?? ''))

/** بيان الحزمة على القرص */
export function newManifest(pkg, supabaseUrl) {
  return {
    tool: 'akaram-archive', version: 1, supabase_url: supabaseUrl,
    package: { id: pkg.id, code: pkg.code, period_from: pkg.period_from, period_to: pkg.period_to, file_count: pkg.file_count, total_bytes: pkg.total_bytes },
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    files: {}, // key = bucket + '\n' + storage_path → { local, sha256, bytes, downloaded_at }
    missing: [],
  }
}
export const fileKey = (bucket, path) => `${bucket}\n${path}`

/** العناصر التي ما زالت تحتاج تنزيلاً (ليست في البيان ببصمة صالحة) */
export function pendingItems(items, manifest) {
  return items.filter((it) => it.status !== 'missing' && it.status !== 'purged' && !isSha256(manifest.files[fileKey(it.bucket, it.storage_path)]?.sha256))
}

export function recordDownloaded(manifest, it, sha256, bytes) {
  manifest.files[fileKey(it.bucket, it.storage_path)] = { bucket: it.bucket, path: it.storage_path, local: safeLocalPath(it.bucket, it.storage_path), sha256, bytes, downloaded_at: new Date().toISOString() }
  manifest.updated_at = new Date().toISOString()
}
export function recordMissing(manifest, it) {
  if (!manifest.missing.some((m) => m.bucket === it.bucket && m.path === it.storage_path)) manifest.missing.push({ bucket: it.bucket, path: it.storage_path })
  manifest.updated_at = new Date().toISOString()
}

/** ما يُرسل إلى cold_archive_items_downloaded */
export const toDownloadedPayload = (entries) => entries.map((e) => ({ bucket: e.bucket, path: e.path, sha256: e.sha256, bytes: e.bytes }))

export function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** مقارنة بصمات القرص بالبيان: تُعيد المطابق + التالف + الناقص */
export function compareDisk(manifest, diskHashes /* Map<key, sha256|null> */) {
  const ok = [], corrupt = [], absent = []
  for (const e of Object.values(manifest.files)) {
    const got = diskHashes.get(fileKey(e.bucket, e.path))
    if (got == null) absent.push(e)
    else if (got === e.sha256) ok.push({ bucket: e.bucket, path: e.path, sha256: got })
    else corrupt.push({ ...e, actual: got })
  }
  return { ok, corrupt, absent }
}

/** تحليل وسائط سطر الأوامر: command code --to X --from Y --disk Z */
export function parseArgs(argv) {
  const [command, ...rest] = argv
  const out = { command: command ?? 'help', code: null, opts: {} }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a.startsWith('--')) { const k = a.slice(2); const v = rest[i + 1]; if (v !== undefined && !v.startsWith('--')) { out.opts[k] = v; i++ } else out.opts[k] = true }
    else if (!out.code) out.code = a
  }
  return out
}

export const fmtBytes = (n) => { const v = Number(n ?? 0); if (v < 1024) return `${v} B`; if (v < 1024 ** 2) return `${(v / 1024).toFixed(0)} KB`; if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`; return `${(v / 1024 ** 3).toFixed(2)} GB` }
