/**
 * أرشيف تقارير الخريطة — Excel يُبنى في المتصفح، يُرفع إلى bucket خاص،
 * ويُسجَّل ببصمة SHA-256 (ترحيل 20261128000300 — الجولة ③).
 *
 * ─── لماذا نرفع ملفاً كان يمكن تنزيله فقط؟ ────────────────────────────────
 * نقاط GPS الخام تُحذف بعد **48 ساعة** (قرار المالك 2026-11-24). أي أن
 * التقرير، بعد يومين، **لا يمكن إعادة بنائه** — لا من القاعدة ولا من المزوّد
 * (احتفاظه 30 يوماً ثم يذهب). الملف المرفوع هو النسخة الرسمية الدائمة.
 *
 * ─── لماذا البصمة؟ ────────────────────────────────────────────────────────
 * «هل هذا الملف هو نفسه الذي أُرسل للشركة؟» سؤال يُطرح بعد شهر بلا جواب.
 * SHA-256 المحسوبة **في العميل** قبل الرفع ثم من Bytes المرفوعة: المقارنة
 * تُثبت أن ما وصل هو ما بُني. لو اختلفا نرمي خطأً — لا نسجّل أرشيفاً كاذباً.
 *
 * ─── لماذا لا حذف تلقائي؟ ─────────────────────────────────────────────────
 * هذه سجلات رسمية تُقابل جهة خارجية. أي حذف يحتاج طلب احتفاظ صريح بموافقة،
 * لا `retention policy` صامتة. لذلك لا واجهة حذف هنا إطلاقاً.
 */
import { supabase, sdkGuard } from '@sdk/client'

const BUCKET = 'map-reports'
/** 25 م.ب — مطابق لحد bucket في الترحيل. التحقق هنا للرسالة المبكرة لا للحماية. */
export const MAX_BYTES = 26214400

export type ExportKindId =
  | 'sheet' | 'alley' | 'street' | 'driver' | 'vehicle' | 'mahalla' | 'uncertain' | 'full'

export interface ReportFileRow {
  id: string
  storage_path: string
  kind_id: ExportKindId
  kind_label: string
  zone_id: string | null
  zone_name: string | null
  day: string
  filter_count: number
  rows_count: number
  sheet_name: string
  sha256: string
  bytes: number
  uploaded_by: string
  uploaded_by_name: string | null
  created_at: string
}

export interface ArchiveInput {
  /** المصنف جاهزاً كـArrayBuffer — تأتي من `wb.xlsx.writeBuffer()` */
  buffer: ArrayBuffer
  kindId: ExportKindId
  kindLabel: string
  day: string
  /** اسم التبويب بعد التطبيع — نُسجّله للبحث */
  sheetName: string
  zoneId?: string | null
  zoneName?: string | null
  filterCount?: number
  rowsCount?: number
}

export interface ArchiveResult {
  file: ReportFileRow
  /** البصمة المحسوبة في العميل */
  sha256: string
  bytes: number
  /** المسار في bucket map-reports */
  path: string
}

/**
 * SHA-256 سداسي (صغير) عبر Web Crypto.
 * مُعرَّضة كدالة مستقلّة لأن الاختبار يحتاجها بلا شبكة ولا Supabase.
 */
export async function sha256Hex(buf: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<string> {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const PADDED = (n: number) => String(n).padStart(2, '0')

/**
 * اسم ملف آمن: لا محارف ممنوعة في أنظمة الملفات ولا في Storage،
 * ولا يتجاوز 100 حرف. الطابع الزمني بالدقيقة يمنع التصادم عند تصدير
 * نفس النوع مرتين في نفس الجلسة (يُستبدل السجل، وهو المطلوب — لا نسخ صامتة).
 */
export function archiveFileName(kind: ExportKindId, zoneLabel: string, day: string, at = new Date()): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|#%\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'زون'
  const stamp = `${day}_${PADDED(at.getHours())}${PADDED(at.getMinutes())}`
  return `${kind}__${safe(zoneLabel)}__${stamp}.xlsx`
}

/** المسار الكامل: reports/<uid>/<yyyy-mm>/<day>/<filename> — يطابق سياسة Storage */
export function archivePath(userId: string, day: string, fileName: string): string {
  const ym = day.slice(0, 7)
  return `reports/${userId}/${ym}/${day}/${fileName}`
}

/** تنسيق البايتات للعرض — «1.4 م.ب» لا «1468006» */
export function bytesText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} بايت`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ك.ب`
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`
}

/**
 * رفع + تسجيل في خطوة واحدة، والتحقق من البصمة قبل التسجيل.
 *
 * الترتيب **مقصود**:
 *   ① حساب البصمة في العميل
 *   ② فحص الحجم (رسالة مفهومة بدل خطأ Storage غامض)
 *   ③ الرفع إلى bucket
 *   ④ تنزيل Bytes المرفوعة ومقارنة البصمة
 *      ← هذه الخطوة هي التي تجعل الادعاء قابلاً للإثبات: لو فسد الرفع
 *        نكتشفه الآن، لا بعد شهرين حين يُطلب الملف الرسمي.
 *   ⑤ التسجيل في القاعدة عبر RPC (يتحقق بدوره من البصمة والمسار)
 *
 * عند أي فشل في ③–⑤: نحذف الملف من Storage كي لا يبقى يتيم بلا سجل.
 * (`storage.remove` لا يرمي على غير الموجود — آمنة في التنظيف.)
 */
export async function archiveReport(input: ArchiveInput): Promise<ArchiveResult> {
  const bytes = input.buffer.byteLength
  if (bytes <= 0) throw new Error('الملف فارغ — لا شيء ليُؤرشف')
  if (bytes > MAX_BYTES) {
    throw new Error(`الملف ${bytesText(bytes)} يتجاوز الحد ${bytesText(MAX_BYTES)} — صدّر مدة أقصر أو آليات أقل`)
  }

  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) throw new Error('لا جلسة — لا يمكن أرشفة ملف باسم مجهول')
  const userId = auth.user.id

  const sha256 = await sha256Hex(input.buffer)
  const fileName = archiveFileName(input.kindId, input.zoneName ?? input.day, input.day)
  const path = archivePath(userId, input.day, fileName)

  let uploaded = false
  try {
    await sdkGuard(
      supabase.storage.from(BUCKET).upload(path, input.buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      }),
    )
    uploaded = true

    // ④ إثبات أن ما وصل هو ما بُني — لا ثقة عمياء في الرفع
    const { data: back, error: backErr } = await supabase.storage.from(BUCKET).download(path)
    if (backErr || !back) throw new Error(`تعذّر التحقق من الملف المرفوع: ${backErr?.message ?? 'بلا بيانات'}`)
    const actual = await sha256Hex(await back.arrayBuffer())
    if (actual !== sha256) {
      throw new Error('البصمة لا تطابق — الملف المرفوع مختلف عن المُنشأ. لم يُسجَّل في الأرشيف.')
    }

    // ⑤ السجل في القاعدة
    const { data, error } = await supabase.rpc('map_report_register_file' as never, {
      p_path: path,
      p_kind_id: input.kindId,
      p_kind_label: input.kindLabel,
      p_day: input.day,
      p_sheet_name: input.sheetName,
      p_sha256: sha256,
      p_bytes: bytes,
      p_zone_id: input.zoneId ?? null,
      p_zone_name: input.zoneName ?? null,
      p_filter_count: input.filterCount ?? 0,
      p_rows_count: input.rowsCount ?? 0,
    } as never)
    if (error) throw new Error(`تسجيل الأرشيف فشل: ${error.message}`)

    return { file: data as unknown as ReportFileRow, sha256, bytes, path }
  } catch (e) {
    // تنظيف: لا نترك ملفاً يتيماً يُوهم بأنه مؤرشف
    if (uploaded) {
      await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined)
    }
    throw e
  }
}

export interface ArchiveFilters {
  zoneId?: string | null
  from?: string | null
  to?: string | null
  kindId?: ExportKindId | null
  limit?: number
}

/** قائمة الأرشيف — لا استثناءات صامتة: الفشل يرمي */
export async function listArchivedReports(filters: ArchiveFilters = {}): Promise<ReportFileRow[]> {
  const { data, error } = await supabase.rpc('map_report_files_list' as never, {
    p_zone: filters.zoneId ?? null,
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_kind: filters.kindId ?? null,
    p_limit: filters.limit ?? 100,
  } as never)
  if (error) throw new Error(`قائمة الأرشيف: ${error.message}`)
  return (data ?? []) as unknown as ReportFileRow[]
}

/**
 * رابط تنزيل مؤقّت — bucket خاص، فلا رابط دائم.
 * 600 ثانية: كافية للتنزيل ولا تُبقي الباب مفتوحاً.
 */
export async function archiveDownloadUrl(path: string, expiresIn = 600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn)
  if (error || !data?.signedUrl) throw new Error(`رابط التنزيل: ${error?.message ?? 'تعذّر إنشاء الرابط'}`)
  return data.signedUrl
}
