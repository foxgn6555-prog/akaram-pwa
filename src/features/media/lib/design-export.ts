/**
 * تصدير التقرير المصور كملف (HTML / PDF / PowerPoint) — من المعاينة نفسها.
 *
 * المبدأ: الملف يجب أن يطابق المعاينة المطبوعة حرفياً، لذلك لا نعيد بناء التصميم
 * بل نلتقط أوراق التقرير `.rp-page` كما رُسمت في المتصفح:
 *  · HTML  → نسخة مستقلة بالكامل (الأنماط مُدمجة في كل عنصر والصور Base64)
 *            تُفتح في أي متصفح وتُطبع بنفس فواصل الصفحات.
 *  · PDF   → كل ورقة تُحوَّل إلى صورة عالية الدقة ثم تُوضع على صفحة A4 عمودية.
 *  · PPTX  → كل ورقة شريحة مستقلة بقياس A4 (نفس الباني المستخدم لتقارير الشكاوى).
 *  00198: الصور تُصغَّر إلى 1600 بكسل وتُخزَّن مؤقتاً، مهلة لكل صورة/ورقة مع محاولة أخف، وشرائح JPEG — لا تعليق على الصور الكبيرة.
 *
 * الدوال النقية (بناء HTML/تسمية الملف/قياسات الشرائح) مفصولة عن الـDOM حتى تُختبر.
 */
import { buildPptx, type SlidePart } from '@lib/pptx/complaintPptx'

export type DesignExportFormat = 'html' | 'pdf' | 'pptx'

export const DESIGN_EXPORT_LABEL: Record<DesignExportFormat, string> = {
  html: 'تصدير HTML',
  pdf: 'تصدير PDF',
  pptx: 'تصدير PowerPoint',
}

export const DESIGN_EXPORT_EXT: Record<DesignExportFormat, string> = {
  html: 'html',
  pdf: 'pdf',
  pptx: 'pptx',
}

/** قياس شريحة الباني المشترك (16:9) بوحدة EMU، والورقة A4 عمودية تُوسَّط داخلها بكامل الارتفاع */
export const SLIDE_EMU = { cx: 12192000, cy: 6858000 } as const
export function a4PortraitBox(slide = SLIDE_EMU) {
  const h = slide.cy
  const w = Math.round((h * 210) / 297)
  return { x: Math.round((slide.cx - w) / 2), y: 0, w, h }
}

/** اسم ملف آمن: يحافظ على العربية ويزيل الرموز الممنوعة في ويندوز/لينكس */
export function designFileName(title: string, format: DesignExportFormat, date = new Date()): string {
  const clean = (title || 'تقرير-مصور').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '-').slice(0, 80)
  const stamp = date.toISOString().slice(0, 10)
  return `${clean}-${stamp}.${DESIGN_EXPORT_EXT[format]}`
}

/** صفحة واحدة ملتقطة: HTML مُسطّح (أنماط مدمجة + صور Base64) */
export interface CapturedPage {
  html: string
}

/** مستند HTML مستقل من الصفحات الملتقطة — يُطبع ورقة/صفحة بلا رؤوس متصفح */
export function buildStandaloneHtml(title: string, pages: CapturedPage[], fontFamily = "Cairo, Tajawal, 'Segoe UI', Tahoma, Arial, sans-serif"): string {
  const body = pages.map((p) => `<section class="xp-page">${p.html}</section>`).join('\n')
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: ${fontFamily}; }
  .xp-page { position: relative; width: 210mm; height: 297mm; margin: 6mm auto; background: #fff; overflow: hidden;
    box-shadow: 0 2px 12px rgb(15 23 42 / .18); break-after: page; page-break-after: always; }
  .xp-page:last-of-type { break-after: auto; page-break-after: auto; }
  .xp-page > * { position: absolute !important; inset: 10mm !important; width: 190mm !important; height: 277mm !important; margin: 0 !important; box-shadow: none !important; }
  img { max-width: 100%; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { html, body { background: #fff; } .xp-page { margin: 0; box-shadow: none; } }
</style>
</head>
<body>
${body}
</body>
</html>`
}

export function escapeHtml(v: unknown): string {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** شريحة PowerPoint = صورة الورقة A4 موسَّطة بكامل ارتفاع الشريحة */
export function pageSlide(index: number, pngName: string): SlidePart {
  const b = a4PortraitBox()
  const xml =
    `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Page ${index + 1}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${b.x}" y="${b.y}"/><a:ext cx="${b.w}" cy="${b.h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>` +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  const rels =
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${pngName}"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    `</Relationships>`
  return { xml, rels, images: [] }
}

/* ───────────────────────── الجزء المعتمد على المتصفح ───────────────────────── */

const STYLE_PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'inset', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin', 'padding', 'border', 'border-radius', 'border-collapse', 'border-spacing', 'box-sizing', 'box-shadow', 'outline',
  'background', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'background-clip',
  'color', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-decoration',
  'text-transform', 'text-shadow', 'writing-mode', 'text-orientation', 'white-space', 'word-break', 'overflow-wrap', 'direction', 'unicode-bidi', 'vertical-align',
  'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'justify-content', 'justify-items', 'align-items', 'align-content', 'align-self', 'gap', 'row-gap', 'column-gap',
  'grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-column', 'grid-row', 'grid-auto-flow', 'place-items', 'place-content',
  'object-fit', 'object-position', 'overflow', 'z-index', 'transform', 'transform-origin', 'aspect-ratio', 'table-layout', 'visibility', 'cursor',
  '-webkit-background-clip', '-webkit-text-fill-color',
]

/** يُسقط العناصر الخاصة بالشاشة ويحوّل الأنماط المحسوبة إلى أنماط مضمّنة */
export async function flattenPage(page: HTMLElement): Promise<string> {
  const clone = page.cloneNode(true) as HTMLElement
  const srcNodes = [page, ...Array.from(page.querySelectorAll<HTMLElement>('*'))]
  const dstNodes = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]
  const removable: HTMLElement[] = []
  for (let i = 0; i < srcNodes.length; i++) {
    const src = srcNodes[i]
    const dst = dstNodes[i]
    if (!src || !dst) continue
    if (src.classList.contains('no-print') || src.tagName === 'STYLE' || src.tagName === 'SCRIPT' || src.tagName === 'INPUT') {
      removable.push(dst)
      continue
    }
    const cs = window.getComputedStyle(src)
    const decl: string[] = []
    for (const prop of STYLE_PROPS) {
      const v = cs.getPropertyValue(prop)
      if (v && v !== 'normal' && v !== 'none' && v !== 'auto' && v !== '0px') decl.push(`${prop}:${v}`)
      else if (v && (prop === 'display' || prop === 'position' || prop === 'width' || prop === 'height')) decl.push(`${prop}:${v}`)
    }
    if (i === 0) decl.push('margin:0', 'box-shadow:none')
    dst.setAttribute('style', decl.join(';'))
    dst.removeAttribute('class')
    dst.removeAttribute('contenteditable')
    dst.removeAttribute('data-testid')
    for (const a of Array.from(dst.attributes)) if (a.name.startsWith('on')) dst.removeAttribute(a.name)
  }
  removable.forEach((n) => n.remove())
  // النصوص القابلة للتعديل تُرسم أزراراً على الشاشة — في الملف تصبح نصاً عادياً
  for (const btn of Array.from(clone.querySelectorAll('button'))) {
    const span = document.createElement('span')
    span.setAttribute('style', `${btn.getAttribute('style') ?? ''};cursor:default;outline:none;appearance:none`)
    while (btn.firstChild) span.appendChild(btn.firstChild)
    btn.replaceWith(span)
  }
  // الصور → Base64 حتى يبقى الملف مستقلاً عن الروابط الموقعة المؤقتة
  const imgs = Array.from(clone.querySelectorAll('img'))
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src')
      if (!src || src.startsWith('data:')) return
      const data = await toDataUrl(src, 2000)
      if (data) img.setAttribute('src', data)
    }),
  )
  return clone.outerHTML
}

/** مهلة جلب صورة واحدة — بعدها نتجاوزها بدل تعليق التصدير كله */
export const IMAGE_FETCH_TIMEOUT_MS = 20_000
/** أقصى ضلع للصور المضمّنة في الملف: الورقة تُرسم بدقة ×2 فلا حاجة لأكثر من ذلك */
export const EMBED_MAX_EDGE = 1600

const dataUrlCache = new Map<string, Promise<string | null>>()

/** يجلب الصورة (بمهلة) ويصغّرها إلى EMBED_MAX_EDGE ويعيدها JPEG Base64 — مع تخزين مؤقت لكل رابط (الغلاف/الشعارات تتكرر في كل ورقة) */
async function toDataUrl(url: string, maxEdge = EMBED_MAX_EDGE): Promise<string | null> {
  const key = `${maxEdge}|${url}`
  const hit = dataUrlCache.get(key)
  if (hit) return hit
  const job = (async () => {
    try {
      const ctrl = new AbortController()
      const timer = window.setTimeout(() => ctrl.abort(), IMAGE_FETCH_TIMEOUT_MS)
      let blob: Blob
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: ctrl.signal })
        if (!res.ok) return null
        blob = await res.blob()
      } finally {
        window.clearTimeout(timer)
      }
      const shrunk = await shrinkBlob(blob, maxEdge)
      return await blobToDataUrl(shrunk ?? blob)
    } catch {
      return null
    }
  })()
  dataUrlCache.set(key, job)
  return job
}

/** يصغّر الصورة النقطية إلى ضلع أقصى ويعيدها JPEG؛ null إن لم يلزم أو تعذّر (نستخدم الأصل عندها) */
async function shrinkBlob(blob: Blob, maxEdge: number): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || !blob.type.startsWith('image/') || blob.type === 'image/svg+xml' || blob.type === 'image/gif') return null
  let bmp: ImageBitmap | null = null
  try {
    bmp = await createImageBitmap(blob)
    const edge = Math.max(bmp.width, bmp.height)
    if (edge <= maxEdge && blob.size < 600 * 1024) return null
    const k = Math.min(1, maxEdge / edge)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bmp.width * k))
    canvas.height = Math.max(1, Math.round(bmp.height * k))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  } catch {
    return null
  } finally {
    bmp?.close?.()
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}

/** يترك المتصفح يرسم شريط التقدّم بين الأوراق */
const nextFrame = () => new Promise<void>((r) => window.setTimeout(r, 0))

/** وعد بمهلة — لتعليق html-to-image على ورقة ثقيلة بدل تجميد التصدير كله */
function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(tag)), ms)
    p.then((v) => { window.clearTimeout(t); resolve(v) }, (e) => { window.clearTimeout(t); reject(e) })
  })
}

export function reportPages(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('#design-report .rp-page'))
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** يرسم الورقة كصورة PNG بدقة عالية — عبر html-to-image (المتصفح نفسه يرسم، فتُدعم ألوان
 *  Tailwind v4 (oklch) والخطوط العربية المضمّنة)؛ الصور الموقّعة تُحوَّل Base64 مسبقاً حتى لا تُحجب. */
export const PAGE_RENDER_TIMEOUT_MS = 45_000
async function rasterizePage(page: HTMLElement, scale = 2): Promise<HTMLCanvasElement> {
  const { toCanvas } = await import('html-to-image')
  const inlined = await inlineImages(page)
  const opts = (pixelRatio: number, skipFonts: boolean) => ({
    width: page.offsetWidth,
    height: page.offsetHeight,
    pixelRatio,
    backgroundColor: '#ffffff',
    cacheBust: false,
    skipFonts,
    // الورقة على الشاشة موسَّطة بـ margin:auto؛ القيمة المحسوبة (بالبكسل) تُنسخ إلى النسخة
    // الملتقطة فتنزاح الورقة وتُقص — نصفّر الهوامش والظل والتحويلات في اللقطة
    style: { margin: '0', boxShadow: 'none', transform: 'none', left: '0', top: '0' },
    filter: (node: Node) => !(node instanceof Element && (node.classList.contains('no-print') || node.tagName === 'INPUT')),
  })
  try {
    try {
      return await withTimeout(toCanvas(page, opts(scale, false)), PAGE_RENDER_TIMEOUT_MS, 'PAGE_RENDER_TIMEOUT')
    } catch {
      // محاولة ثانية أخف: بلا تضمين خطوط وبدقة أقل — تنجح حيث تعلق الأولى على الأجهزة الضعيفة
      return await withTimeout(toCanvas(page, opts(Math.min(scale, 1.5), true)), PAGE_RENDER_TIMEOUT_MS, 'PAGE_RENDER_TIMEOUT')
    }
  } finally {
    inlined.forEach(({ img, src }) => img.setAttribute('src', src))
  }
}

/** يستبدل مصادر الصور مؤقتاً بـ Base64 ويعيد ما يلزم لاستعادتها */
async function inlineImages(page: HTMLElement): Promise<Array<{ img: HTMLImageElement; src: string }>> {
  const imgs = Array.from(page.querySelectorAll('img')).filter((i) => i.src && !i.src.startsWith('data:'))
  const restored: Array<{ img: HTMLImageElement; src: string }> = []
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src') ?? ''
      const data = await toDataUrl(src)
      if (!data) return
      restored.push({ img, src })
      img.setAttribute('src', data)
      await img.decode().catch(() => undefined)
    }),
  )
  return restored
}

function canvasToBytes(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg' = 'image/jpeg', quality = 0.92): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error('CANVAS_EMPTY'))
      resolve(new Uint8Array(await blob.arrayBuffer()))
    }, type, quality)
  })
}

/** رسالة عربية واضحة عند فشل ورقة بعينها */
function pageError(i: number, e: unknown): Error {
  const m = e instanceof Error ? e.message : String(e)
  return new Error(m === 'PAGE_RENDER_TIMEOUT' ? `الورقة ${i + 1} استغرقت وقتاً طويلاً — صغّر الصور أو أعد المحاولة` : `تعذّر رسم الورقة ${i + 1}: ${m}`)
}

export interface ExportProgress {
  (done: number, total: number): void
}

/** نقطة الدخول الوحيدة من الواجهة */
export async function exportDesign(format: DesignExportFormat, title: string, onProgress?: ExportProgress): Promise<void> {
  const pages = reportPages()
  if (!pages.length) throw new Error('NO_PAGES')
  const name = designFileName(title, format)

  if (format === 'html') {
    const captured: CapturedPage[] = []
    for (let i = 0; i < pages.length; i++) {
      await nextFrame()
      captured.push({ html: await flattenPage(pages[i] as HTMLElement) })
      onProgress?.(i + 1, pages.length)
    }
    const font = window.getComputedStyle(document.getElementById('design-report') ?? document.body).fontFamily
    downloadBlob(new Blob([buildStandaloneHtml(title, captured, font)], { type: 'text/html;charset=utf-8' }), name)
    return
  }

  if (format === 'pdf') {
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
    for (let i = 0; i < pages.length; i++) {
      await nextFrame()
      let canvas: HTMLCanvasElement
      try { canvas = await rasterizePage(pages[i] as HTMLElement) } catch (e) { throw pageError(i, e) }
      if (i > 0) pdf.addPage('a4', 'portrait')
      // الورقة المعروضة 190×277مم داخل A4 بهامش 10مم — نضعها في موضعها الطبيعي
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 10, 10, 190, 277, undefined, 'FAST')
      onProgress?.(i + 1, pages.length)
    }
    pdf.setProperties({ title, creator: 'شركة جزيرة الأكارم' })
    downloadBlob(pdf.output('blob'), name)
    return
  }

  // pptx
  const { default: JSZip } = await import('jszip')
  const slides: SlidePart[] = []
  for (let i = 0; i < pages.length; i++) {
    await nextFrame()
    let canvas: HTMLCanvasElement
    try { canvas = await rasterizePage(pages[i] as HTMLElement) } catch (e) { throw pageError(i, e) }
    const bytes = await canvasToBytes(canvas, 'image/jpeg', 0.92)
    const pngName = `page${i + 1}.jpg`
    const slide = pageSlide(i, pngName)
    slide.images.push({ name: pngName, bytes })
    slides.push(slide)
    onProgress?.(i + 1, pages.length)
  }
  const out = await buildPptx(slides, title, new JSZip())
  downloadBlob(new Blob([out as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), name)
}
