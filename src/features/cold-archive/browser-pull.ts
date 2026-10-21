/**
 * 🧊 تنزيل حزمة الأرشيف البارد من المتصفح مباشرة إلى مجلد يختاره المستخدم (00320)
 *  يعتمد على File System Access API (Chrome/Edge على ويندوز/ماك/لينكس). بلا أداة خارجية ولا طرفية:
 *  اختيار مجلد → تنزيل كل ملف → بصمة SHA-256 → تسجيلها في المنصة → إعادة قراءة كل ملف من القرص والتحقق → تسجيل النسخة.
 *  قابل للاستئناف: manifest.json داخل مجلد الحزمة يحفظ ما اكتمل.
 */
import { supabase } from '@sdk/client'
import { coldArchive, type ColdItem, type ColdPackage } from '@sdk/cold-archive.sdk'

/* ───── أنواع File System Access (غير مكتملة في lib.dom) ───── */
export interface FsWritable { write(data: Uint8Array<ArrayBuffer> | Blob | string): Promise<void>; close(): Promise<void> }
export interface FsFileHandle { kind: 'file'; name: string; getFile(): Promise<File>; createWritable(): Promise<FsWritable> }
export interface FsDirHandle {
  kind: 'directory'; name: string
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsDirHandle>
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>
}
type PickerWindow = Window & { showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<FsDirHandle> }

export const browserPullSupported = () => typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function'
/** يفتح نافذة اختيار المجلد؛ يعيد null إن ألغى المستخدم */
export async function pickDirectory(): Promise<FsDirHandle | null> {
  const w = window as PickerWindow
  if (!w.showDirectoryPicker) throw new Error('المتصفح لا يدعم الكتابة إلى مجلد — استخدم Chrome أو Edge')
  try { return await w.showDirectoryPicker({ mode: 'readwrite', id: 'akaram-cold-archive' }) }
  catch (e) { if ((e as { name?: string }).name === 'AbortError') return null; throw e }
}

/* ───── تسمية عربية مقروءة على القرص ─────
 * <المجلد المختار>/الأرشيف البارد <من> إلى <إلى> (<الرمز>)/<المصدر>/<السنة-الشهر>/<التاريخ>/<التاريخ>_<تسلسل>.<امتداد>
 * الأسماء قصيرة (تتجنب حد 260 حرفاً في ويندوز) وخالية من الأحرف الممنوعة؛ الربط بالمسار الأصلي في «الفهرس.csv» و manifest.json.
 */
export const SOURCE_FOLDERS: Record<string, string> = {
  media_submission_photos: 'صور الإعلام',
  contractor_checkins: 'صور المتعهدين',
  complaint_media: 'الشكاوى الرسمية',
  citizen_complaint_photos: 'شكاوى المواطنين',
  citizen_chat_attachments: 'محادثات المواطنين',
  sector_photos: 'صور القواطع',
  gbs_container_updates: 'حاويات GBS',
  vehicle_maintenance_attachments: 'مرفقات الصيانة',
  garage_vehicles: 'صور الآليات',
  employee_documents: 'مستندات الموظفين',
  media_covers: 'أغلفة الإعلام',
}
// eslint-disable-next-line no-control-regex -- أحرف التحكم ممنوعة في أسماء ملفات ويندوز
const WIN_FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/g
/** اسم مجلد/ملف صالح على ويندوز وماك ولينكس */
export const safeName = (s: string) => (s.replace(WIN_FORBIDDEN, '_').replace(/[. ]+$/, '').trim() || '_')
export const packageFolderName = (p: Pick<ColdPackage, 'code' | 'period_from' | 'period_to'>) => safeName(`الأرشيف البارد ${p.period_from} إلى ${p.period_to} (${p.code})`)
const extOf = (path: string) => { const m = /\.([a-z0-9]{1,5})$/i.exec(path.split('/').pop() ?? ''); return m ? '.' + (m[1] as string).toLowerCase() : '' }
/** مسار الملف داخل مجلد الحزمة؛ `seq` تسلسل ثابت للملف داخل يومه ومصدره */
export function localSegments(it: Pick<ColdItem, 'source_key' | 'record_date' | 'storage_path'>, seq: number): string[] {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(it.record_date) ? it.record_date : 'بدون-تاريخ'
  return [safeName(SOURCE_FOLDERS[it.source_key] ?? it.source_key), d.slice(0, 7), d, `${d}_${String(seq).padStart(3, '0')}${extOf(it.storage_path)}`]
}
/** تسلسل ثابت لكل ملف داخل (المصدر، اليوم) حسب ترتيب المعرّف — لا يتغير بين التشغيلات */
export function assignSequences(items: ColdItem[]): Map<number, number> {
  const counters = new Map<string, number>(); const out = new Map<number, number>()
  for (const it of [...items].sort((a, b) => a.id - b.id)) { const k = it.source_key + '|' + it.record_date; const n = (counters.get(k) ?? 0) + 1; counters.set(k, n); out.set(it.id, n) }
  return out
}
/** «الفهرس.csv» — UTF-8 مع BOM ليفتحه Excel بالعربية مباشرة */
export function buildIndexCsv(entries: ManifestEntry[]): string {
  const q = (v: string | number) => '"' + String(v).replace(/"/g, '""') + '"'
  const head = ['المصدر', 'التاريخ', 'رقم السجل', 'الملف على القرص', 'المسار الأصلي في المنصة', 'الحجم (بايت)', 'SHA-256']
  const rows = [...entries].sort((a, b) => a.local.join('/').localeCompare(b.local.join('/'), 'ar'))
    .map((e) => [SOURCE_FOLDERS[e.source_key ?? ''] ?? e.source_key ?? '', e.record_date ?? '', e.record_id ?? '', e.local.join('\\'), `${e.bucket}/${e.path}`, e.bytes, e.sha256].map(q).join(','))
  return '\ufeff' + [head.map(q).join(','), ...rows].join('\r\n') + '\r\n'
}
/** قراءة Blob كـ ArrayBuffer بطريقة تعمل في كل البيئات (بعض البيئات بلا Blob.arrayBuffer) */
export async function blobBytes(b: Blob): Promise<Uint8Array<ArrayBuffer>> {
  const ab: ArrayBuffer = typeof b.arrayBuffer === 'function' ? await b.arrayBuffer() : await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.onerror = () => rej(r.error); r.readAsArrayBuffer(b) })
  const out = new Uint8Array(new ArrayBuffer(ab.byteLength)); out.set(new Uint8Array(ab))   // نسخة في نطاق الصفحة الحالي (تتجنب مشاكل ArrayBuffer عبر النطاقات)
  return out
}
export const sha256Hex = async (buf: Uint8Array<ArrayBuffer> | ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('')

/* ───── البيان ───── */
export interface ManifestEntry { bucket: string; path: string; local: string[]; sha256: string; bytes: number; downloaded_at: string; source_key?: string; record_id?: string; record_date?: string }
export interface Manifest { tool: string; version: number; package: { id: string; code: string; period_from: string; period_to: string }; created_at: string; updated_at: string; files: Record<string, ManifestEntry>; missing: Array<{ bucket: string; path: string }> }
export const fileKey = (bucket: string, path: string) => `${bucket}\n${path}`
const newManifest = (p: ColdPackage): Manifest => ({ tool: 'akaram-platform', version: 1, package: { id: p.id, code: p.code, period_from: p.period_from, period_to: p.period_to }, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), files: {}, missing: [] })

async function readManifest(dir: FsDirHandle): Promise<Manifest | null> {
  try { const fh = await dir.getFileHandle('manifest.json'); return JSON.parse(new TextDecoder().decode(await blobBytes(await fh.getFile()))) as Manifest } catch { return null }
}
async function writeText(dir: FsDirHandle, name: string, text: string) {
  const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(text); await w.close()
}
async function writeManifest(dir: FsDirHandle, m: Manifest) {
  m.updated_at = new Date().toISOString()
  await writeText(dir, 'manifest.json', JSON.stringify(m, null, 2))
  await writeText(dir, 'الفهرس.csv', buildIndexCsv(Object.values(m.files)))
}
async function fileHandleFor(dir: FsDirHandle, segs: string[], create: boolean): Promise<FsFileHandle> {
  let cur = dir
  for (const s of segs.slice(0, -1)) cur = await cur.getDirectoryHandle(s, { create })
  return cur.getFileHandle(segs[segs.length - 1] as string, { create })
}

const rpc = async <T,>(fn: string, args: Record<string, unknown>) => { const { data, error } = await supabase.rpc(fn, args as never); if (error) throw new Error(`${fn}: ${error.message}`); return data as T }
async function allItems(pkgId: string): Promise<ColdItem[]> {
  const out: ColdItem[] = []; let after = 0
  for (;;) {
    const rows = (await rpc<ColdItem[] | null>('cold_archive_items_list', { p_package: pkgId, p_after: after, p_limit: 1000 })) ?? []
    out.push(...rows); if (rows.length < 1000) break; after = rows[rows.length - 1]?.id ?? after
  }
  return out
}

export type PullPhase = 'listing' | 'downloading' | 'verifying' | 'registering' | 'done'
export interface PullProgress { phase: PullPhase; done: number; total: number; bytes: number; missing: number; failed: number }
export interface PullFailure { bucket: string; path: string; reason: string }
export interface PullResult { package: ColdPackage; downloaded: number; missing: number; failed: number; verified: boolean; corrupt: number; failures: PullFailure[] }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const errMsg = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)) || 'خطأ غير معروف'
/** تنزيل بمحاولات متكررة (3 محاولات) — يعيد `null` عند عدم وجود الملف في التخزين. */
async function downloadWithRetry(bucket: string, path: string, attempts = 3): Promise<Blob | null> {
  let last: unknown = null
  for (let a = 0; a < attempts; a++) {
    if (a > 0) await sleep(800 * a)
    try {
      const { data, error } = await supabase.storage.from(bucket).download(path)
      if (data && !error) return data
      const msg = String((error as { message?: string } | null)?.message ?? '')
      if (/not.?found|404|does not exist/i.test(msg)) return null
      last = new Error(msg || 'فشل التنزيل')
    } catch (e) { last = e }
  }
  throw last
}

/**
 * التنزيل + التحقق + التسجيل في خطوة واحدة.
 * `diskLabel` اسم القرص الذي ستُسجَّل به النسخة (افتراضياً اسم المجلد المختار).
 */
export async function pullPackageToDirectory(pkgId: string, root: FsDirHandle, opts: { diskLabel: string; onProgress?: (p: PullProgress) => void; signal?: AbortSignal }): Promise<PullResult> {
  const report = (p: PullProgress) => opts.onProgress?.(p)
  const pkg = await coldArchive.package(pkgId)
  if (!['ready', 'verified'].includes(pkg.status)) throw new Error('حالة الحزمة لا تسمح بالتنزيل')
  report({ phase: 'listing', done: 0, total: 0, bytes: 0, missing: 0, failed: 0 })
  const all = await allItems(pkg.id)
  const seqOf = assignSequences(all)
  const items = all.filter((i) => i.status === 'listed' || i.status === 'downloaded')
  const dir = await root.getDirectoryHandle(packageFolderName(pkg), { create: true })
  const m = (await readManifest(dir)) ?? newManifest(pkg)
  if (m.package.id !== pkg.id) throw new Error('هذا المجلد يحوي حزمة أخرى بنفس الرمز — اختر مجلداً آخر')

  /* ① التنزيل */
  const knownMissing = new Set(m.missing.map((x) => fileKey(x.bucket, x.path)))
  const todo = items.filter((it) => !knownMissing.has(fileKey(it.bucket, it.storage_path)) && !/^[0-9a-f]{64}$/.test(m.files[fileKey(it.bucket, it.storage_path)]?.sha256 ?? ''))
  let done = 0, bytes = 0, missing = 0, failed = 0, pending: ManifestEntry[] = []
  const failures: PullFailure[] = []
  const flush = async () => {
    if (pending.length) await rpc('cold_archive_items_downloaded', { p_package: pkg.id, p_items: pending.map((e) => ({ bucket: e.bucket, path: e.path, sha256: e.sha256, bytes: e.bytes })) })
    pending = []; await writeManifest(dir, m)
  }
  report({ phase: 'downloading', done: 0, total: todo.length, bytes: 0, missing: 0, failed: 0 })
  for (const it of todo) {
    if (opts.signal?.aborted) { await flush(); throw new Error('أُوقف التنزيل — يمكنك الاستئناف لاحقاً من نفس المجلد') }
    try {
      const data = await downloadWithRetry(it.bucket, it.storage_path)
      if (!data) { await rpc('cold_archive_item_missing', { p_package: pkg.id, p_bucket: it.bucket, p_path: it.storage_path }); m.missing.push({ bucket: it.bucket, path: it.storage_path }); missing++; continue }
      const buf = await blobBytes(data)
      const segs = localSegments(it, seqOf.get(it.id) ?? 0)
      const fh = await fileHandleFor(dir, segs, true); const w = await fh.createWritable(); await w.write(buf); await w.close()
      const sha = await sha256Hex(buf)
      const entry: ManifestEntry = { bucket: it.bucket, path: it.storage_path, local: segs, sha256: sha, bytes: buf.byteLength, downloaded_at: new Date().toISOString(), source_key: it.source_key, record_id: it.record_id, record_date: it.record_date }
      m.files[fileKey(it.bucket, it.storage_path)] = entry; pending.push(entry); done++; bytes += buf.byteLength
      if (pending.length >= 100) await flush()
    } catch (e) { failed++; failures.push({ bucket: it.bucket, path: it.storage_path, reason: errMsg(e) }) }
    report({ phase: 'downloading', done, total: todo.length, bytes, missing, failed })
  }
  await flush()
  // إعادة إبلاغ كل البصمات المعروفة (يعالج انقطاعاً سابقاً قبل الإبلاغ)
  const known = Object.values(m.files)
  for (let i = 0; i < known.length; i += 200) await rpc('cold_archive_items_downloaded', { p_package: pkg.id, p_items: known.slice(i, i + 200).map((e) => ({ bucket: e.bucket, path: e.path, sha256: e.sha256, bytes: e.bytes })) })
  if (failed > 0) return { package: await coldArchive.package(pkg.id), downloaded: done, missing, failed, verified: false, corrupt: 0, failures }

  /* ② التحقق من القرص: إعادة قراءة كل ملف ومطابقة بصمته */
  const entries = Object.values(m.files); const ok: Array<{ bucket: string; path: string; sha256: string }> = []; let corrupt = 0, i = 0
  report({ phase: 'verifying', done: 0, total: entries.length, bytes, missing, failed })
  for (const e of entries) {
    try {
      const f = await (await fileHandleFor(dir, e.local, false)).getFile()
      const sha = await sha256Hex(await blobBytes(f))
      if (sha === e.sha256) ok.push({ bucket: e.bucket, path: e.path, sha256: sha })
      else { corrupt++; delete m.files[fileKey(e.bucket, e.path)] }   // يُعاد تنزيله في المحاولة التالية
    } catch { corrupt++; delete m.files[fileKey(e.bucket, e.path)] }
    report({ phase: 'verifying', done: ++i, total: entries.length, bytes, missing, failed })
  }
  if (corrupt > 0) { await writeManifest(dir, m); return { package: await coldArchive.package(pkg.id), downloaded: done, missing, failed, verified: false, corrupt, failures } }

  /* ③ تسجيل النسخة */
  report({ phase: 'registering', done: entries.length, total: entries.length, bytes, missing, failed })
  const after = await rpc<ColdPackage>('cold_archive_copy_verify', { p_package: pkg.id, p_disk_label: opts.diskLabel.trim() || root.name || 'قرص', p_ok_hashes: ok })
  report({ phase: 'done', done: entries.length, total: entries.length, bytes, missing, failed })
  return { package: after, downloaded: done, missing, failed, verified: true, corrupt: 0, failures }
}
