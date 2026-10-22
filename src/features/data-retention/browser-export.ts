/**
 * تصدير مُثبَت من المتصفح (00326): يكتب صفوف طلب الحذف إلى مجلد يختاره المستخدم
 * (CSV عربي يفتحه Excel + JSON كامل)، يحسب SHA-256 لملف JSON، ثم يسجّل الإثبات في المنصة.
 * يعيد استخدام أدوات الأرشيف البارد (اختيار المجلد، الأسماء الآمنة، البصمة).
 */
import { supabase } from '@sdk/client'
import { dataRetention, type RetentionRequest } from '@sdk/data-retention.sdk'
import { safeName, sha256Hex, type FsDirHandle } from '@features/cold-archive/browser-pull'

export type ExportRow = Record<string, string | number | boolean | null>
export interface ExportProgress { phase: 'fetching' | 'writing' | 'registering' | 'done'; rows: number }
export interface ExportResult { request: RetentionRequest; rows: number; sha256: string; folder: string; files: string[] }

/** CSV بعلامة BOM ليفتحه Excel بالعربية؛ الأعمدة من مفاتيح أول صف */
export function rowsToCsv(rows: ExportRow[]): string {
  if (rows.length === 0) return '\ufeff'
  const cols = Object.keys(rows[0] as ExportRow)
  const q = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  return '\ufeff' + [cols.map(q).join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\r\n') + '\r\n'
}

export const exportFolderName = (label: string, cutoff: string) => safeName(`${label} حتى ${cutoff.slice(0, 10)}`)

async function writeFile(dir: FsDirHandle, name: string, data: Uint8Array<ArrayBuffer> | string) {
  const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(data); await w.close()
}

/** يجلب كل الصفوف على دفعات بمؤشر ثابت */
export async function fetchAllRows(requestId: string, onProgress?: (n: number) => void): Promise<{ rows: ExportRow[]; label: string; cutoff: string }> {
  const rows: ExportRow[] = []; let after: unknown = null; let label = '', cutoff = ''
  for (;;) {
    const { data, error } = await supabase.rpc('data_retention_export_rows', { p_request: requestId, p_after: after, p_limit: 2000 } as never)
    if (error) throw new Error(`data_retention_export_rows: ${error.message}`)
    const page = data as { rows: ExportRow[]; count: number; next: unknown; label: string; cutoff: string }
    rows.push(...page.rows); label = page.label; cutoff = page.cutoff
    onProgress?.(rows.length)
    if (!page.next) break
    after = page.next
  }
  return { rows, label, cutoff }
}

export async function exportRequestToDirectory(req: Pick<RetentionRequest, 'id'>, root: FsDirHandle, opts: { onProgress?: (p: ExportProgress) => void } = {}): Promise<ExportResult> {
  const report = (p: ExportProgress) => opts.onProgress?.(p)
  report({ phase: 'fetching', rows: 0 })
  const { rows, label, cutoff } = await fetchAllRows(req.id, (n) => report({ phase: 'fetching', rows: n }))
  report({ phase: 'writing', rows: rows.length })
  const folder = exportFolderName(label, cutoff)
  const dir = await (await root.getDirectoryHandle('الاحتفاظ بالبيانات', { create: true })).getDirectoryHandle(folder, { create: true })
  const base = safeName(label)
  const json = new TextEncoder().encode(JSON.stringify({ النوع: label, 'الصفوف الأقدم من': cutoff, 'عدد الصفوف': rows.length, 'تاريخ التصدير': new Date().toISOString(), الصفوف: rows }, null, 1)) as Uint8Array<ArrayBuffer>
  await writeFile(dir, `${base}.json`, json)
  await writeFile(dir, `${base}.csv`, rowsToCsv(rows))
  const sha256 = await sha256Hex(json)
  await writeFile(dir, 'الإثبات.txt', `النوع: ${label}\r\nالصفوف الأقدم من: ${cutoff}\r\nعدد الصفوف: ${rows.length}\r\nSHA-256 لملف ${base}.json: ${sha256}\r\nتاريخ التصدير: ${new Date().toISOString()}\r\nالمجلد: ${root.name}\r\n`)
  report({ phase: 'registering', rows: rows.length })
  const request = await dataRetention.exportRecorded(req.id, rows.length, sha256, root.name || folder)
  report({ phase: 'done', rows: rows.length })
  return { request, rows: rows.length, sha256, folder, files: [`${base}.json`, `${base}.csv`, 'الإثبات.txt'] }
}
