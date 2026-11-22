/** محلّل البيانات: فك الترميز، الترقيم، إسناد المحلة، القصّ على حدود الزون */
const D = require('/tmp/shot/data2.js')

const hex = (t) => {
  const neg = t[0] === '-'
  const b = t[0] === '+' || t[0] === '-' ? t.slice(1) : t
  const v = parseInt(b, 16)
  return neg ? -v : v
}
function decode(blob) {
  const out = []
  const segs = blob.split(';')
  let x = 0, y = 0
  for (let i = 0; i < segs.length; i++) {
    const [a, b] = segs[i].split(',')
    if (i === 0) { x = parseInt(a, 16); y = parseInt(b, 16) }
    else { x += hex(a); y += hex(b) }
    out.push([x, y])
  }
  return out
}

const KIND = { P: 'primary', S: 'secondary', T: 'tertiary', L: 'local', A: 'alley' }
const ROADS = D.roads.split('|').map((tok) => {
  const m = tok.match(/^(\d+)([PSTLA])/)
  return { id: m[1], kind: KIND[m[2]] || 'local', pts: decode(tok.slice(m[0].length)) }
}).filter((r) => r.pts.length > 1)

const ZONE = decode(D.zone)

// محلات: كل سطر = حلقة واحدة (قد تكون مكررة/multipolygon)
const MH = []
for (const line of D.mahallaRings.split('\n')) {
  const parts = line.trim().split(':')
  const rid = parts[0]
  const blob = parts.slice(2).join(':')
  MH.push({ rid, name: D.mahallaNames[rid], ring: decode(blob) })
}

// ── قصّ مقطع على مضلع (Sutherland–Hodgman بسيط عبر split per-edge) ──
function clipSegment(p0, p1, poly) {
  let t0 = 0, t1 = 1
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1]
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const ex = b[0] - a[0], ey = b[1] - a[1]
    // داخل = يسار الحافة (نضبط الاتجاه لاحقاً)
    const num = ex * (poly.length ? 0 : 0)
    const c = ex * (p0[1] - a[1]) - ey * (p0[0] - a[0])
    const d = ex * dy - ey * dx
    if (Math.abs(d) < 1e-12) {
      if (c > 0) return null
      continue
    }
    const t = -c / d
    if (d > 0) { if (t < t0) continue; if (t > t1) return null; t1 = Math.min(t1, t) }
    else { if (t > t1) continue; if (t < t0) return null; t0 = Math.max(t0, t) }
  }
  if (t1 - t0 < 1e-6) return null
  return [[p0[0] + dx * t0, p0[1] + dy * t0], [p0[0] + dx * t1, p0[1] + dy * t1]]
}
const signedArea = (poly) => {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}
const ZONE_CCW = signedArea(ZONE) > 0 ? ZONE : [...ZONE].reverse()

const inPoly = ([x, y], poly) => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function segIntersect(p0, p1, a, b) {
  const r = [p1[0] - p0[0], p1[1] - p0[1]]
  const q = [b[0] - a[0], b[1] - a[1]]
  const den = r[0] * q[1] - r[1] * q[0]
  if (Math.abs(den) < 1e-12) return null
  const t = ((a[0] - p0[0]) * q[1] - (a[1] - p0[1]) * q[0]) / den
  const u = ((a[0] - p0[0]) * r[1] - (a[1] - p0[1]) * r[0]) / den
  if (t <= 1e-9 || t >= 1 - 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null
  return t
}
// تقسيم كل مقطع عند تقاطعه مع حدود المضلّع، ثم إبقاء المقاطع التي منتصفها داخل
function clipPolyline(pts, poly) {
  const out = []
  let cur = []
  const push = () => { if (cur.length > 1) out.push(cur); cur = [] }
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i]
    const ts = [0, 1]
    for (let k = 0; k < poly.length; k++) {
      const t = segIntersect(p0, p1, poly[k], poly[(k + 1) % poly.length])
      if (t !== null) ts.push(t)
    }
    ts.sort((a, b) => a - b)
    for (let k = 1; k < ts.length; k++) {
      const t0 = ts[k - 1], t1 = ts[k]
      if (t1 - t0 < 1e-9) continue
      const mid = [p0[0] + (p1[0] - p0[0]) * ((t0 + t1) / 2), p0[1] + (p1[1] - p0[1]) * ((t0 + t1) / 2)]
      if (!inPoly(mid, poly)) { push(); continue }
      const A = [p0[0] + (p1[0] - p0[0]) * t0, p0[1] + (p1[1] - p0[1]) * t0]
      const B = [p0[0] + (p1[0] - p0[0]) * t1, p0[1] + (p1[1] - p0[1]) * t1]
      if (!cur.length) cur.push(A)
      else {
        const last = cur[cur.length - 1]
        if (Math.hypot(last[0] - A[0], last[1] - A[1]) > 0.5) { push(); cur.push(A) }
      }
      cur.push(B)
    }
    // إن كانت النهاية غير داخل ⇒ أغلق المقطع
    if (cur.length && !inPoly(p1, poly)) push()
  }
  push()
  return out
}
const mOf = (p) => {
  for (const m of MH) if (inPoly(p, m.ring)) return m.name
  return null
}
const centroid = (pts) => {
  let sx = 0, sy = 0, best = 0, bl = -1
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    if (L > bl) { bl = L; best = i }
  }
  for (const [x, y] of pts) { sx += x; sy += y }
  return [sx / pts.length, sy / pts.length]
}
const lenOf = (pts) => {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return L
}

// ── القصّ + الترقيم ────────────────────────────────────
const CLIPPED = []
for (const r of ROADS) {
  for (const seg of clipPolyline(r.pts, ZONE_CCW)) {
    if (seg.length < 2) continue
    const L = lenOf(seg)
    if (L < 6) continue          // أقل من ~11 م ⇒ شظية
    // نقطة منتصف الفئة: نأخذ منتصف أطول وتر لضمان الداخل
    let best = 0, bl = -1
    for (let i = 1; i < seg.length; i++) {
      const d = Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1])
      if (d > bl) { bl = d; best = i }
    }
    const mid = [(seg[best][0] + seg[best - 1][0]) / 2, (seg[best][1] + seg[best - 1][1]) / 2]
    CLIPPED.push({ ...r, pts: seg, len: L, cen: mid, mahalla: mOf(mid) })
  }
}

const ORDER = ['primary', 'secondary', 'tertiary', 'local', 'alley']
const PREFIX = { primary: 'STR', secondary: 'SEC', tertiary: 'TRC', local: 'LOC', alley: 'ALY' }
const BY_KIND = {}
for (const k of ORDER) {
  BY_KIND[k] = CLIPPED.filter((r) => r.kind === k)
    .sort((a, b) => a.cen[1] - b.cen[1] || a.cen[0] - b.cen[0])
    .map((r, i) => ({ ...r, code: `${PREFIX[k]}-${String(i + 1).padStart(4, '0')}` }))
}

// محلات مرقّمة (بعد إزالة الحلقات المكررة)
const seen = new Set()
const MHL = []
for (const m of MH) {
  const key = m.name + ':' + Math.round(m.ring[0][0] / 4) + ':' + Math.round(m.ring[0][1] / 4)
  if (seen.has(key)) continue
  seen.add(key)
  MHL.push(m)
}
const MH_NAMES = [...new Set(MHL.map((m) => m.name))].sort()
MH_NAMES.forEach((n, i) => { MHL.filter((m) => m.name === n).forEach((m) => { m.code = `MHL-${String(i + 1).padStart(4, '0')}` }) })

const ALL = ORDER.flatMap((k) => BY_KIND[k])
const stats = {
  total: ALL.length,
  byKind: Object.fromEntries(ORDER.map((k) => [k, BY_KIND[k].length])),
  mahallas: MH_NAMES.length,
  lengthKm: ALL.reduce((s, r) => s + r.len, 0) / 1000,
  assigned: ALL.filter((r) => r.mahalla).length,
  named: { 4074579: 1, 4241608: 1, 959005034: 1, 4243207: 1, 666684011: 1, 4245212: 1, 4255786: 1, 4255800: 1, 4255864: 1, 4255875: 1, 4255888: 1, 1092307215: 1, 1126439323: 1, 4241783: 1 },
}

module.exports = { D, ZONE, ZONE_CCW, CLIPPED, BY_KIND, ORDER, PREFIX, MH: MHL, MH_NAMES, ALL, stats, lenOf, inPoly, mOf }
