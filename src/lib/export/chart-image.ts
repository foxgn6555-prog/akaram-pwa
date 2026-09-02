/**
 * رسم بياني يُدمج داخل ملف Excel صورةً (PNG) — لأن مكتبة exceljs المجانية
 * لا تنشئ رسوماً بيانية أصلية. نرسم الرسم على <canvas> ونعيده بصيغة buffer.
 *
 * الرسم ينفّذ في المتصفح فقط (jsdom/node بدون canvas ترجع null ويُتجاهل الرسم).
 */

export interface ChartDatum {
  label: string
  value: number
  /** لون العمود (hex مثل #005F8D) */
  color?: string
}

export interface ChartOptions {
  title: string
  /** عنوان محور القيم (اختياري) */
  valueLabel?: string
  /** ارتفاع/عرض الصورة بالبكسل */
  width?: number
  height?: number
}

const TEXT = '#0F172A'
const MUTED = '#64748B'
const GRID = '#E2E8F0'
const BG = '#FFFFFF'

/** ألوان احتياطية متدرّجة للشرائح */
const PALETTE = ['#005F8D', '#F5B400', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9']

/** لون من اللوحة حسب الترتيب (مضمون غير فارغ) */
function paletteColor(i: number): string {
  return PALETTE[i % PALETTE.length] ?? '#005F8D'
}

/**
 * يرسم رسماً عمودياً (bar chart) عربياً على canvas ويعيده كـ Uint8Array (PNG).
 * يعيد null إن لم يتوفّر canvas (بيئة اختبار/Node) أو خلت البيانات.
 */
export function renderBarChartPng(data: ChartDatum[], opts: ChartOptions): Uint8Array | null {
  if (typeof document === 'undefined') return null
  if (!data.length || data.every((d) => !d.value)) return null

  const width = opts.width ?? 900
  const height = opts.height ?? 420
  let ctx: CanvasRenderingContext2D | null = null
  let canvas: HTMLCanvasElement
  try {
    canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    ctx = canvas.getContext('2d')
  } catch {
    return null // بيئة بلا دعم canvas (jsdom/node)
  }
  if (!ctx) return null

  const pad = { top: 56, right: 28, bottom: 90, left: 64 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom

  // خلفية
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, width, height)

  // العنوان
  ctx.fillStyle = TEXT
  ctx.font = 'bold 22px Segoe UI, Tahoma, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(opts.title, width / 2, 30)

  const max = Math.max(...data.map((d) => d.value), 1)
  // خطوة المقياس (رقم جميل)
  const step = niceStep(max)
  const top = Math.ceil(max / step) * step

  // الشبكة الأفقية + تسميات المحور
  ctx.strokeStyle = GRID
  ctx.fillStyle = MUTED
  ctx.font = '13px Segoe UI, Tahoma, sans-serif'
  ctx.textAlign = 'left'
  ctx.lineWidth = 1
  const ticks = Math.round(top / step)
  for (let i = 0; i <= ticks; i++) {
    const v = i * step
    const y = pad.top + plotH - (v / top) * plotH
    ctx.beginPath()
    ctx.moveTo(pad.left, y)
    ctx.lineTo(pad.left + plotW, y)
    ctx.stroke()
    ctx.fillText(String(v), pad.left - 34, y)
  }

  // الأعمدة
  const n = data.length
  const slot = plotW / n
  const barW = Math.min(72, slot * 0.55)
  data.forEach((d, i) => {
    const cx = pad.left + slot * i + slot / 2
    const h = (d.value / top) * plotH
    const x = cx - barW / 2
    const y = pad.top + plotH - h
    const color: string = d.color ?? paletteColor(i)

    // عمود بتدرّج بسيط
    const grad = ctx.createLinearGradient(0, y, 0, y + h)
    grad.addColorStop(0, shade(color, 14))
    grad.addColorStop(1, color)
    ctx.fillStyle = grad
    roundRect(ctx, x, y, barW, h, 6)
    ctx.fill()

    // القيمة فوق العمود
    ctx.fillStyle = TEXT
    ctx.font = 'bold 14px Segoe UI, Tahoma, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(String(d.value), cx, y - 12)

    // التسمية أسفل المحور (تُلتف إن طالت)
    ctx.fillStyle = MUTED
    ctx.font = '13px Segoe UI, Tahoma, sans-serif'
    drawWrappedLabel(ctx, d.label, cx, pad.top + plotH + 22, slot * 0.92)
  })

  return canvasToPng(canvas)
}

/**
 * يرسم رسماً دائرياً (donut) مع وسيلة إيضاح عربية، ويعيده PNG — أو null.
 */
export function renderDonutChartPng(data: ChartDatum[], opts: ChartOptions): Uint8Array | null {
  if (typeof document === 'undefined') return null
  const items = data.filter((d) => d.value > 0)
  if (!items.length) return null

  const width = opts.width ?? 760
  const height = opts.height ?? 420
  let ctx: CanvasRenderingContext2D | null = null
  let canvas: HTMLCanvasElement
  try {
    canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    ctx = canvas.getContext('2d')
  } catch {
    return null
  }
  if (!ctx) return null

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, width, height)

  // العنوان
  ctx.fillStyle = TEXT
  ctx.font = 'bold 22px Segoe UI, Tahoma, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(opts.title, width / 2, 30)

  const total = items.reduce((s, d) => s + d.value, 0) || 1
  const cx = width * 0.32
  const cy = height / 2 + 10
  const outer = Math.min(width, height) * 0.32
  const inner = outer * 0.58

  let angle = -Math.PI / 2
  items.forEach((d, i) => {
    const portion = d.value / total
    const sweep = portion * Math.PI * 2
    const color: string = d.color ?? paletteColor(i)

    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, outer, angle, angle + sweep)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = BG
    ctx.lineWidth = 2
    ctx.stroke()

    // نسبة داخل الشريحة
    if (portion > 0.06) {
      const mid = angle + sweep / 2
      const tx = cx + Math.cos(mid) * (outer * 0.78)
      const ty = cy + Math.sin(mid) * (outer * 0.78)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 14px Segoe UI, Tahoma, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`${Math.round(portion * 100)}%`, tx, ty)
    }
    angle += sweep
  })

  // ثقب المنتصف (دونات)
  ctx.beginPath()
  ctx.arc(cx, cy, inner, 0, Math.PI * 2)
  ctx.fillStyle = BG
  ctx.fill()
  ctx.fillStyle = TEXT
  ctx.font = 'bold 26px Segoe UI, Tahoma, sans-serif'
  ctx.fillText(String(total), cx, cy - 8)
  ctx.fillStyle = MUTED
  ctx.font = '13px Segoe UI, Tahoma, sans-serif'
  ctx.fillText(opts.valueLabel ?? 'الإجمالي', cx, cy + 16)

  // وسيلة الإيضاح
  const legX = width * 0.62
  let legY = cy - (items.length * 30) / 2
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  items.forEach((d, i) => {
    const color: string = d.color ?? paletteColor(i)
    ctx.fillStyle = color
    roundRect(ctx, legX - 18, legY - 9, 18, 18, 4)
    ctx.fill()
    ctx.fillStyle = TEXT
    ctx.font = '14px Segoe UI, Tahoma, sans-serif'
    ctx.fillText(`${d.label} (${d.value})`, legX - 28, legY)
    legY += 32
  })

  return canvasToPng(canvas)
}

/* ── أدوات داخلية ── */

function canvasToPng(canvas: HTMLCanvasElement): Uint8Array | null {
  const dataUrl = canvas.toDataURL('image/png')
  const base64 = dataUrl.split(',')[1]
  if (!base64) return null
  if (typeof atob === 'undefined') return null
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function drawWrappedLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  startY: number,
  maxW: number,
): void {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  lines.slice(0, 2).forEach((ln, i) => {
    ctx.fillText(ln, cx, startY + i * 16)
  })
}

/** خطوة مقياس «جميلة»: 1/2/5 × أس 10 */
function niceStep(max: number): number {
  const raw = max / 4
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const norm = raw / mag
  let nice: number
  if (norm <= 1) nice = 1
  else if (norm <= 2) nice = 2
  else if (norm <= 5) nice = 5
  else nice = 10
  return nice * mag
}

/** تفتيح/تعتيم لون hex بنسبة مئوية */
function shade(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  const hex6 = m?.[1]
  if (!hex6) return hex
  const num = parseInt(hex6, 16)
  const amt = Math.round(2.55 * pct)
  const r = Math.min(255, (num >> 16) + amt)
  const g = Math.min(255, ((num >> 8) & 0xff) + amt)
  const b = Math.min(255, (num & 0xff) + amt)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
