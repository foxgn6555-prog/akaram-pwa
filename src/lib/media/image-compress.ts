/**
 * 00198 · ضغط الصور قبل الرفع (بوابة الإعلام).
 * صور الهواتف 3–8 م.ب لكل صورة كانت تُرفع كما هي ثم تُحمَّل كاملة في المصغّرات والمعاينة والتصدير —
 * وهذا سبب البطء وتعليق تصدير PowerPoint/PDF. نُصغّر الصورة إلى ضلع أقصى 2000 بكسل بجودة JPEG 0.85
 * (كافية للطباعة على A4 بأربع صور في الصفحة) مع الحفاظ على اتجاه EXIF.
 * الدوال النقية (حساب القياس، قرار الضغط) مفصولة لتُختبر بلا متصفح.
 */

export const UPLOAD_MAX_EDGE = 2000
export const UPLOAD_JPEG_QUALITY = 0.85
/** تحت هذا الحجم وبأبعاد ضمن الحد لا نعيد الترميز (نتجنب خسارة جودة بلا فائدة) */
export const UPLOAD_SKIP_BYTES = 700 * 1024

/** القياس الهدف مع الحفاظ على النسبة؛ لا تكبير أبداً */
export function targetSize(width: number, height: number, maxEdge = UPLOAD_MAX_EDGE): { width: number; height: number; scaled: boolean } {
  const edge = Math.max(width, height)
  if (!Number.isFinite(edge) || edge <= 0 || edge <= maxEdge) return { width, height, scaled: false }
  const k = maxEdge / edge
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), scaled: true }
}

/** هل تستحق الصورة إعادة الترميز؟ (كبيرة الحجم أو كبيرة الأبعاد أو بصيغة غير JPEG/WebP) */
export function shouldRecompress(file: { type: string; size: number }, width: number, height: number, maxEdge = UPLOAD_MAX_EDGE, skipBytes = UPLOAD_SKIP_BYTES): boolean {
  if (!file.type.startsWith('image/')) return false
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return false
  if (targetSize(width, height, maxEdge).scaled) return true
  if (file.size > skipBytes) return true
  return file.type !== 'image/jpeg' && file.type !== 'image/webp'
}

export function jpegName(name: string): string {
  const base = (name || 'photo').replace(/\.[a-z0-9]+$/i, '')
  return `${base}.jpg`
}

/** يضغط صورة واحدة في المتصفح؛ عند أي فشل يعيد الملف الأصلي كما هو (لا نمنع الرفع أبداً) */
export async function compressImage(file: File, maxEdge = UPLOAD_MAX_EDGE, quality = UPLOAD_JPEG_QUALITY): Promise<File> {
  if (typeof window === 'undefined' || typeof createImageBitmap !== 'function' || !file.type.startsWith('image/')) return file
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    if (!shouldRecompress(file, bitmap.width, bitmap.height, maxEdge)) return file
    const { width, height } = targetSize(bitmap.width, bitmap.height, maxEdge)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size === 0) return file
    // إن لم يُفِد الضغط (ملف صغير أصلاً) نُبقي الأصل
    if (blob.size >= file.size && !targetSize(bitmap.width, bitmap.height, maxEdge).scaled) return file
    return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    bitmap?.close?.()
  }
}

/** يضغط دفعة بتوازٍ محدود (3) حتى لا يُجمَّد الهاتف */
export async function compressImages(files: File[], onProgress?: (done: number, total: number) => void): Promise<File[]> {
  const out: File[] = new Array(files.length)
  let i = 0
  let done = 0
  const worker = async () => {
    while (i < files.length) {
      const k = i++
      const f = files[k]
      if (!f) continue
      out[k] = await compressImage(f)
      done += 1
      onProgress?.(done, files.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker))
  return out
}
