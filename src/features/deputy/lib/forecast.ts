/**
 * أدوات تحليل وتنبؤ خفيفة واحترافية (بدون خادم):
 *  · انحدار خطي (Least Squares) لسلسلة زمنية ← ميل/تقاطع/معامل تحديد R²
 *  · تنبؤ لـ N فترة قادمة مع نطاق ثقة ± انحراف معياري للمتبقيات
 *  · متوسط متحرك مركزي لتمهيد السلسلة (Smoothing)
 *  · معدل النمو اليومي النسبي (%)
 */

export interface ForecastPoint {
  /** فهرس الفترة (0..n-1 للسلسلة، وn فما بعد للمستقبل) */
  index: number
  value: number
  /** حد أدنى لنطاق الثقة — للتنبؤ فقط */
  low?: number
  /** حد أعلى لنطاق الثقة — للتنبؤ فقط */
  high?: number
  projected?: boolean
}

export interface Regression {
  slope: number
  intercept: number
  r2: number
}

export function linearRegression(values: number[]): Regression {
  const n = values.length
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, r2: 0 }
  const xs = values.map((_, i) => i)
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = values.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (values[i]! - my)
    sxx += (xs[i]! - mx) ** 2
  }
  const slope = sxx === 0 ? 0 : sxy / sxx
  const intercept = my - slope * mx
  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i]!
    ssRes += (values[i]! - pred) ** 2
    ssTot += (values[i]! - my) ** 2
  }
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot)
  return { slope, intercept, r2 }
}

/** تنبؤ خطي مع نطاق ثقة ± انحراف معياري للمتبقيات (z≈1) */
export function forecast(values: number[], horizon: number): ForecastPoint[] {
  const { slope, intercept } = linearRegression(values)
  const residuals = values.map((v, i) => v - (intercept + slope * i))
  const sd = Math.sqrt(residuals.reduce((a, b) => a + b * b, 0) / Math.max(1, residuals.length))
  const out: ForecastPoint[] = values.map((value, index) => ({ index, value }))
  for (let step = 1; step <= horizon; step++) {
    const index = values.length - 1 + step
    const value = Math.max(0, intercept + slope * index)
    out.push({ index, value: +value.toFixed(2), low: +Math.max(0, value - sd).toFixed(2), high: +(value + sd).toFixed(2), projected: true })
  }
  return out
}

/** متوسط متحرك بم نافذة فردية لتمهيد الضجيج */
export function movingAverage(values: number[], window = 3): number[] {
  const half = Math.floor(window / 2)
  return values.map((_, i) => {
    const from = Math.max(0, i - half)
    const to = Math.min(values.length - 1, i + half)
    const slice = values.slice(from, to + 1)
    return +(slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2)
  })
}

/** معدل النمو النسبي بين متوسط أول نافذة وآخر نافذة (%) */
export function growthRate(values: number[], window = 3): number {
  if (values.length < 2) return 0
  const head = values.slice(0, window)
  const tail = values.slice(-window)
  const mh = head.reduce((a, b) => a + b, 0) / head.length
  const mt = tail.reduce((a, b) => a + b, 0) / tail.length
  if (mh === 0) return mt === 0 ? 0 : 100
  return +(((mt - mh) / mh) * 100).toFixed(1)
}

/** وصف عربي لاتجاه السلسلة اعتماداً على ميل الانحدار */
export const trendLabel = (slope: number): string =>
  slope > 0.05 ? 'تصاعدي' : slope < -0.05 ? 'تنازلي' : 'مستقر'
