/**
 * 00202 — تصدير التصميم المكتمل إلى ملف Word (.docx) قابل للتعديل.
 * على خلاف PDF/PowerPoint (لقطات نقطية للأوراق) يُبنى ملف Word من البيانات نفسها:
 *   الغلاف (صورة كاملة) ← صفحة الجدول الرسمية (جدول Word حقيقي بألوان القالب) ← لكل فقرة: ورقة نص ثم صفحات 4 صور (جدول 2×2
 *   عبارة فوق كل صورة) — كل النصوص قابلة للتحرير في Word والصور قابلة للاستبدال.
 * الباني `buildWordDocument` نقي (يستقبل الصور جاهزة) ليُختبر دون متصفح؛ تحميل الصور في `loadWordImages`.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextDirection,
  TextRun,
  VerticalAlign,
  WidthType,
  type TableVerticalAlign,
  type IParagraphOptions,
  type IRunOptions,
} from 'docx'

export interface WordImage {
  bytes: Uint8Array
  width: number
  height: number
  type: 'jpg' | 'png'
}
export interface WordSummary {
  companyName: string
  reportLine: string
  orgLabel: string
  orgValue: string
  subjectLabel: string
  subjectValue: string
  dateLabel: string
  dateValue: string
  sectorName: string
  rows: Array<{ t: string; work: string }>
  footer: string
}
export interface WordReportData {
  title: string
  /** رابط الغلاف (أو null ⇒ صفحة عنوان نصية) */
  coverUrl: string | null
  /** 00200: غلاف قالب جاهز مرسوم في الصفحة — يُلتقط كصورة عند التصدير */
  coverNode?: () => HTMLElement | null
  summary: WordSummary
  /** ألوان صفوف الجدول الثلاثة (من قالب الملخص) */
  theme: Array<{ bg: string; fg: string }>
  /** ألوان شريط العبارة والحدود */
  colors: { barFrom: string; barTo: string; border: string; barText: string }
  fontName: string
  groups: Array<{ workType: string; sheetText: string; photos: Array<{ url: string; caption: string }> }>
  logos?: { company?: string; baghdad?: string }
}

/* ===== قياسات A4 (DXA = 1/20 نقطة؛ EMU للصور) ===== */
const MM = 56.6929 // dxa لكل ملم
const PAGE_W = Math.round(210 * MM)
const PAGE_H = Math.round(297 * MM)
const MARGIN = Math.round(12 * MM)
const CONTENT_W = PAGE_W - MARGIN * 2
const CONTENT_H = PAGE_H - MARGIN * 2
/** أبعاد الصور بالبكسل (docx يحوّل 1px = 9525 EMU) */
const PX_PER_MM = 96 / 25.4
const COVER_BOX = { w: Math.floor(186 * PX_PER_MM), h: Math.floor(273 * PX_PER_MM) }
export const PHOTO_BOX = { w: Math.floor(86 * PX_PER_MM), h: Math.floor(118 * PX_PER_MM) }

const hex = (c: string) => c.replace('#', '').slice(0, 6).toUpperCase()

/** يلائم صورة داخل صندوق مع حفظ النسبة (نقي — مُختبر) */
export function fitInBox(w: number, h: number, box: { w: number; h: number }): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) return { width: box.w, height: box.h }
  const k = Math.min(box.w / w, box.h / h)
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) }
}

export const chunk4 = <T,>(arr: T[]): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += 4) out.push(arr.slice(i, i + 4))
  return out
}

/** عدد صفحات الملف المتوقع: غلاف + جدول + لكل فقرة (ورقة + صفحات صورها) */
export function wordPageCount(groups: WordReportData['groups']): number {
  return 2 + groups.reduce((n, g) => n + 1 + chunk4(g.photos).length, 0)
}

function run(text: string, opts: Omit<IRunOptions, 'text'> & { font?: string } = {}): TextRun {
  return new TextRun({ text, rightToLeft: true, ...opts })
}
function para(text: string, opts: Partial<IParagraphOptions> & { size?: number; bold?: boolean; color?: string; font?: string } = {}): Paragraph {
  const { size, bold, color, font, ...p } = opts
  return new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, ...p, children: [run(text, { size, bold, color, font })] })
}
const pageBreak = () => new Paragraph({ children: [new PageBreak()] })

function imagePara(img: WordImage | undefined, box: { w: number; h: number }, alt: string): Paragraph {
  if (!img) return para(alt, { size: 20, color: '94A3B8' })
  const { width, height } = fitInBox(img.width, img.height, box)
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({ type: img.type, data: img.bytes, transformation: { width, height }, altText: { title: alt, description: alt, name: alt } })],
  })
}

function cell(children: Paragraph[], o: { width: number; fill?: string; border?: string; vAlign?: TableVerticalAlign; colSpan?: number; rowSpan?: number; vertical?: boolean } = { width: 1000 }): TableCell {
  const b = { style: BorderStyle.SINGLE, size: 6, color: hex(o.border ?? '#444444') }
  return new TableCell({
    children,
    width: { size: o.width, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(o.fill) } : undefined,
    borders: { top: b, bottom: b, left: b, right: b },
    verticalAlign: o.vAlign ?? VerticalAlign.CENTER,
    columnSpan: o.colSpan,
    rowSpan: o.rowSpan,
    textDirection: o.vertical ? TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  })
}

/* ===== صفحة الجدول الرسمية ===== */
function summaryPage(d: WordReportData, images: Map<string, WordImage>): Array<Paragraph | Table> {
  const s = d.summary
  const t0 = d.theme[0] ?? { bg: '#1e3a8a', fg: '#ffffff' }
  const theme = [0, 1, 2].map((i) => d.theme[i] ?? t0)
  const font = d.fontName
  const logoW = Math.round(40 * MM)
  const header = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    visuallyRightToLeft: true,
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          plainCell([imagePara(d.logos?.company ? images.get(d.logos.company) : undefined, { w: 100, h: 60 }, 'شعار الشركة')], logoW),
          plainCell(
            [
              para(s.companyName, { size: 26, bold: true, color: '1E40AF', font }),
              para(s.reportLine, { size: 22, bold: true, color: 'D97706', font }),
            ],
            CONTENT_W - logoW * 2,
          ),
          plainCell([imagePara(d.logos?.baghdad ? images.get(d.logos.baghdad) : undefined, { w: 90, h: 60 }, 'شعار أمانة بغداد')], logoW),
        ],
      }),
    ],
  })

  const cT = Math.round(10 * MM)
  const cSector = Math.round(26 * MM)
  const cMain = CONTENT_W - cT - cSector
  const border = '#1e3a8a'
  const rows: TableRow[] = []
  const infoRows: Array<[string, string, number]> = [
    [s.orgLabel, s.orgValue, 0],
    [s.subjectLabel, s.subjectValue, 1],
    [s.dateLabel, s.dateValue, 2],
  ]
  for (const [label, value, i] of infoRows) {
    const th = theme[i]!
    rows.push(
      new TableRow({
        height: { value: Math.round(11 * MM), rule: HeightRule.ATLEAST },
        children: [
          cell([para(label, { size: 22, bold: true, color: hex(th.fg), font, alignment: AlignmentType.RIGHT })], { width: cMain, fill: th.bg, border }),
          cell([para(value, { size: 22, bold: i === 2, color: hex(th.fg), font, alignment: AlignmentType.RIGHT })], { width: cSector + cT, fill: th.bg, border, colSpan: 2 }),
        ],
      }),
    )
  }
  rows.push(
    new TableRow({
      tableHeader: true,
      children: [
        cell([para('الفقرات المنجزة', { size: 22, bold: true, color: '0C4A6E', font, alignment: AlignmentType.RIGHT })], { width: cMain, fill: '#e0f2fe', border }),
        cell([para('اسم القاطع', { size: 22, bold: true, color: '0C4A6E', font })], { width: cSector, fill: '#e0f2fe', border }),
        cell([para('ت', { size: 22, bold: true, color: '0C4A6E', font })], { width: cT, fill: '#e0f2fe', border }),
      ],
    }),
  )
  const list = s.rows.length ? s.rows : [{ t: '1', work: '' }]
  list.forEach((r, i) => {
    const children = [cell([para(r.work, { size: 21, font, alignment: AlignmentType.RIGHT })], { width: cMain, border })]
    if (i === 0) children.push(cell([para(s.sectorName, { size: 22, bold: true, color: '0C4A6E', font })], { width: cSector, border, rowSpan: list.length, vertical: true }))
    children.push(cell([para(r.t, { size: 21, font })], { width: cT, border }))
    rows.push(new TableRow({ height: { value: Math.round(9 * MM), rule: HeightRule.ATLEAST }, children }))
  })
  const table = new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, visuallyRightToLeft: true, rows })

  const footer = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    visuallyRightToLeft: true,
    borders: noBorders,
    rows: [new TableRow({ children: [cell([para(s.footer, { size: 20, bold: true, color: hex(t0.fg), font })], { width: CONTENT_W, fill: t0.bg, border: t0.bg })] })],
  })
  return [header, new Paragraph({ spacing: { after: 120 } }), table, new Paragraph({ spacing: { after: 240 } }), footer]
}

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
}
function plainCell(children: Paragraph[], width: number): TableCell {
  const n = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  return new TableCell({ children, width: { size: width, type: WidthType.DXA }, borders: { top: n, bottom: n, left: n, right: n }, verticalAlign: VerticalAlign.CENTER })
}

/* ===== ورقة النص الوسطية ===== */
function sheetPage(text: string, d: WordReportData): Array<Paragraph | Table> {
  const b = { style: BorderStyle.DOUBLE, size: 18, color: hex(d.colors.border) }
  const box = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    visuallyRightToLeft: true,
    rows: [
      new TableRow({
        height: { value: CONTENT_H - Math.round(4 * MM), rule: HeightRule.EXACT },
        children: [
          new TableCell({
            children: [para(text, { size: 56, bold: true, color: '0F172A', font: d.fontName })],
            width: { size: CONTENT_W, type: WidthType.DXA },
            borders: { top: b, bottom: b, left: b, right: b },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 200, bottom: 200, left: 400, right: 400 },
          }),
        ],
      }),
    ],
  })
  return [box]
}

/* ===== صفحة 4 صور (2×2) ===== */
function photosPage(four: Array<{ url: string; caption: string }>, d: WordReportData, images: Map<string, WordImage>): Array<Paragraph | Table> {
  const colW = Math.floor(CONTENT_W / 2)
  const rowsArr: TableRow[] = []
  for (let r = 0; r < 2; r++) {
    const pair = [four[r * 2], four[r * 2 + 1]]
    rowsArr.push(
      new TableRow({
        height: { value: Math.round(9 * MM), rule: HeightRule.EXACT },
        cantSplit: true,
        children: pair.map((p) =>
          p
            ? cell([para(p.caption, { size: 22, bold: true, color: hex(d.colors.barText), font: d.fontName })], { width: colW, fill: d.colors.barTo, border: d.colors.border })
            : plainCell([new Paragraph('')], colW),
        ),
      }),
    )
    rowsArr.push(
      new TableRow({
        height: { value: Math.round(124 * MM), rule: HeightRule.EXACT },
        cantSplit: true,
        children: pair.map((p) => (p ? cell([imagePara(images.get(p.url), PHOTO_BOX, p.caption)], { width: colW, border: d.colors.border }) : plainCell([new Paragraph('')], colW))),
      }),
    )
  }
  return [new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, visuallyRightToLeft: true, rows: rowsArr })]
}

/** يبني مستند Word كاملاً من بيانات التصميم والصور المحمّلة (نقي) */
export function buildWordDocument(d: WordReportData, images: Map<string, WordImage>): Document {
  const body: Array<Paragraph | Table> = []
  // 1) الغلاف
  const cover = d.coverUrl ? images.get(d.coverUrl) : undefined
  if (cover) body.push(imagePara(cover, COVER_BOX, 'غلاف التقرير'))
  else body.push(new Paragraph({ spacing: { before: Math.round(100 * MM) } }), para(d.title, { size: 64, bold: true, font: d.fontName }))
  body.push(pageBreak())
  // 2) الجدول الرسمي
  body.push(...summaryPage(d, images))
  // 3) الفقرات
  for (const g of d.groups) {
    body.push(pageBreak(), ...sheetPage(g.sheetText || g.workType, d))
    for (const four of chunk4(g.photos)) body.push(pageBreak(), ...photosPage(four, d, images))
  }
  return new Document({
    creator: 'شركة جزيرة الأكارم — بوابة الإعلام',
    title: d.title,
    description: 'تقرير مصور قابل للتعديل',
    styles: { default: { document: { run: { font: d.fontName, size: 22, rightToLeft: true }, paragraph: { alignment: AlignmentType.RIGHT } } } },
    sections: [
      {
        properties: {
          page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } },
        },
        children: body,
      },
    ],
  })
}

/* ===== تحميل الصور (متصفح) ===== */
export const WORD_IMAGE_MAX_EDGE = 1400

async function decodeImage(blob: Blob, maxEdge: number): Promise<WordImage | null> {
  if (typeof createImageBitmap !== 'function') return null
  let bmp: ImageBitmap | null = null
  try {
    bmp = await createImageBitmap(blob)
    const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bmp.width * k))
    canvas.height = Math.max(1, Math.round(bmp.height * k))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const keepPng = blob.type === 'image/png' && blob.size < 400 * 1024
    if (!keepPng) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, keepPng ? 'image/png' : 'image/jpeg', 0.86))
    if (!out) return null
    return { bytes: new Uint8Array(await out.arrayBuffer()), width: canvas.width, height: canvas.height, type: keepPng ? 'png' : 'jpg' }
  } catch {
    return null
  } finally {
    bmp?.close?.()
  }
}

/** يحمّل الصور بتوازٍ محدود مع مهلة لكل صورة؛ الصورة المتعذرة تُترك (تظهر بديلاً نصياً) ولا توقف التصدير */
export async function loadWordImages(urls: string[], onProgress?: (done: number, total: number) => void, timeoutMs = 20_000): Promise<Map<string, WordImage>> {
  const uniq = Array.from(new Set(urls.filter(Boolean)))
  const out = new Map<string, WordImage>()
  let i = 0
  let done = 0
  const worker = async () => {
    while (i < uniq.length) {
      const url = uniq[i++]!
      try {
        const ctrl = new AbortController()
        const t = window.setTimeout(() => ctrl.abort(), timeoutMs)
        try {
          const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: ctrl.signal })
          if (res.ok) {
            const img = await decodeImage(await res.blob(), WORD_IMAGE_MAX_EDGE)
            if (img) out.set(url, img)
          }
        } finally {
          window.clearTimeout(t)
        }
      } catch {
        /* تُترك الصورة */
      }
      done += 1
      onProgress?.(done, uniq.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, uniq.length) }, worker))
  return out
}

export const BUILTIN_COVER_KEY = '__builtin_cover__'
/** يلتقط عنصر DOM (غلاف القالب الجاهز) كصورة JPEG بدقة ×2 */
async function captureNode(node: HTMLElement): Promise<WordImage | null> {
  try {
    const { toCanvas } = await import('html-to-image')
    const canvas = await toCanvas(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: false, style: { transform: 'none' } })
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) return null
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height, type: 'jpg' }
  } catch {
    return null
  }
}

/** التصدير الكامل: تحميل الصور ← بناء المستند ← Blob */
export async function exportDesignWord(d: WordReportData, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const urls = [d.coverUrl ?? '', d.logos?.company ?? '', d.logos?.baghdad ?? '', ...d.groups.flatMap((g) => g.photos.map((p) => p.url))].filter(Boolean)
  const images = await loadWordImages(urls, onProgress)
  const node = d.coverNode?.()
  if (node) {
    const shot = await captureNode(node)
    if (shot) {
      images.set(BUILTIN_COVER_KEY, shot)
      d = { ...d, coverUrl: BUILTIN_COVER_KEY }
    }
  }
  const doc = buildWordDocument(d, images)
  return Packer.toBlob(doc)
}
