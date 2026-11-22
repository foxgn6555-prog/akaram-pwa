/**
 * الصور النهائية: نظرة عامة + تكبير محلة + جدول البيانات
 */
const fs = require('fs')
const sharp = require('sharp')
const { ArabicShaper } = require('/tmp/shot/package/index.js')
const G = require('/tmp/shot/geo.js')
const SRC_NAME = require('/tmp/shot/names.json')
const EXTRA = require('/tmp/shot/extra.js')
const EXTRA5 = require('/tmp/shot/extra5.js')
G.SRC_NAME = SRC_NAME

const ar = (t) => ArabicShaper.convertArabic(String(t))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const T = (x, y, s, { size = 16, w = 700, color = '#0f172a', anchor = 'end', op = 1, ls = 0 } = {}) =>
  `<text x="${x}" y="${y}" font-family="Cairo" font-size="${size}" font-weight="${w}" fill="${color}" fill-opacity="${op}" text-anchor="${anchor}" letter-spacing="${ls}">${esc(ar(s))}</text>`

const COL = {
  primary: { core: '#0f172a', body: '#f5b301', halo: '#fffdf5', w: 15 },
  secondary: { core: '#5b21b6', body: '#c4b5fd', halo: '#f5f3ff', w: 11 },
  tertiary: { core: '#be185d', body: '#fbcfe8', halo: '#fdf2f8', w: 9 },
  local: { core: '#0369a1', body: '#7dd3fc', halo: '#f0f9ff', w: 6.5 },
  alley: { core: '#b45309', body: '#fcd34d', halo: '#fffbeb', w: 3.4 },
}
const NAMES = {
  4074579: 'شارع طارق بن زياد', 4241608: 'شارع أبو نؤاس', 959005034: 'شارع خالد بن الوليد',
  1092307215: 'شارع أبو نؤاس', 1126439323: 'شارع طارق بن زياد', 4243207: 'شارع كرادة داخل',
  666684011: 'شارع كرادة داخل', 4245212: 'شارع أبي العطية', 4255786: 'شارع العرصات',
  4255800: 'شارع المسبح', 4255864: 'شارع عشتار', 4255875: 'شارع علي البازركان',
  4255888: 'شارع محمد مهدي كبة', 4241783: 'شارع فوزي القاوقجي',
}

const M = 1 // مقياس
const PF = ([x, y], bb, ox, oy, sc) => [ox + (x - bb.x0) * sc, oy + (y - bb.y0) * sc]
const bboxOf = (pts) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  return { x0, y0, x1, y1 }
}

function drawMap({ W, H, ox, oy, sc, bb, roads, labels = true, zoneWidth = 5, grid = true, mhlLabels = [] }) {
  const p = []
  const d = (pts, close) => pts.map(([x, y], i) => {
    const [px, py] = PF([x, y], bb, ox, oy, sc)
    return (i ? 'L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1)
  }).join(' ') + (close ? ' Z' : '')
  const line = (pts, { color, width, op = 1, dash, cap = 'round', join = 'round' }) =>
    `<path d="${d(pts)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${op}" stroke-linecap="${cap}" stroke-linejoin="${join}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`

  if (grid) p.push(`<g opacity="0.55"><path d="M0 ${H} L${W} ${H}" stroke="none"/></g>`)

  // المحلات (نقاط مرجعية كبيرة)
  for (const m of mhlLabels) {
    const [cx, cy] = PF(m.c, bb, ox, oy, sc)
    p.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="30" fill="#8b5cf6" fill-opacity="0.10" stroke="#8b5cf6" stroke-width="1.6" stroke-dasharray="7 5"/>`)
    p.push(T(cx + 2, cy + 9, m.code.replace('MHL-', ''), { size: 26, w: 800, color: '#6d28d9', anchor: 'middle' }))
    p.push(T(cx + 2, cy + 30, 'محلة', { size: 11, w: 700, color: '#7c3aed', anchor: 'middle', op: 0.9 }))
  }

  // الطرق: طبقة فوق طبقة (زقاق ⇐ رئيسي)
  for (const k of ['alley', 'local', 'tertiary', 'secondary', 'primary']) {
    const c = COL[k]
    const arr = roads.filter((r) => r.kind === k)
    for (const r of arr) p.push(line(r.pts, { color: c.halo, width: c.w * sc * 0.5 + 3.5, op: 0.95 }))
    for (const r of arr) p.push(line(r.pts, { color: c.body, width: Math.max(1.4, c.w * sc * 0.5), op: 1 }))
    for (const r of arr) p.push(line(r.pts, { color: c.core, width: Math.max(0.7, c.w * sc * 0.5 * 0.34), op: 0.85 }))
  }

  if (labels) {
    const done = new Set()
    for (const r of roads) {
      const nm = NAMES[r.id]
      if (!nm || done.has(nm)) continue
      const bb2 = bboxOf(r.pts)
      if (bb2.x1 - bb2.x0 + bb2.y1 - bb2.y0 < 60) continue
      done.add(nm)
      const [cx, cy] = PF([(bb2.x0 + bb2.x1) / 2, (bb2.y0 + bb2.y1) / 2], bb, ox, oy, sc)
      const wid = nm.length * 8.6 + 22
      p.push(`<g><rect x="${cx - wid / 2}" y="${cy - 15}" width="${wid}" height="27" rx="7" fill="#0f172a" fill-opacity="0.9" stroke="#f5b301" stroke-width="1.2"/></g>`)
      p.push(T(cx + wid / 2 - 11, cy + 6, nm, { size: 15, w: 800, color: '#fde68a', anchor: 'end' }))
    }
  }
  return p.join('\n')
}

// ═══════════ الصورة ١: النظرة العامة ═══════════
function overview() {
  const W = 2200, H = 1560
  const PW = 1500, PX = 0, PY = 108
  const bb = bboxOf(G.ZONE)
  const pad = 30
  const sc = Math.min((PW - pad * 2) / (bb.x1 - bb.x0), (H - PY - 190 - pad * 2) / (bb.y1 - bb.y0))
  const ox = PX + (PW - (bb.x1 - bb.x0) * sc) / 2
  const oy = PY + (H - PY - 190 - (bb.y1 - bb.y0) * sc) / 2

  const p = []
  p.push(`<defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#06263c"/><stop offset="0.6" stop-color="#0B4261"/><stop offset="1" stop-color="#0e7490"/></linearGradient>
  <pattern id="g20" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e6eef6" stroke-width="1"/></pattern>
  <pattern id="g100" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M 100 0 L 0 0 0 100" fill="none" stroke="#d3e0ec" stroke-width="1.4"/></pattern>
  <filter id="sh"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0b2033" flood-opacity="0.14"/></filter></defs>`)
  p.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`)
  p.push(`<rect x="${PX}" y="${PY}" width="${PW}" height="${H - PY - 150}" fill="#f8fbfe"/>`)
  p.push(`<rect x="${PX}" y="${PY}" width="${PW}" height="${H - PY - 150}" fill="url(#g20)"/>`)
  p.push(`<rect x="${PX}" y="${PY}" width="${PW}" height="${H - PY - 150}" fill="url(#g100)"/>`)
  p.push(drawMap({ W: PW, H, ox, oy, sc, bb, roads: G.ALL, mhlLabels: G.MH_LABELS || [] }))

  // حدود الزون
  const zd = G.ZONE_CCW.map(([x, y], i) => {
    const [px, py] = PF([x, y], bb, ox, oy, sc)
    return (i ? 'L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1)
  }).join(' ') + ' Z'
  p.push(`<path d="${zd}" fill="#0e7490" fill-opacity="0.035"/>`)
  p.push(`<path d="${zd}" fill="none" stroke="#0f766e" stroke-width="6.5" stroke-opacity="0.9"/>`)
  p.push(`<path d="${zd}" fill="none" stroke="#5eead4" stroke-width="2" stroke-dasharray="18 13" stroke-opacity="0.95"/>`)

  // ═══ الشريط العلوي ═══
  p.push(`<rect width="${W}" height="108" fill="url(#hg)"/>`)
  p.push(T(W - 40, 46, 'زون «الأرخيته» — التخطيط الحقيقي: الشوارع والأزقة والمحلات', { size: 31, w: 800, color: '#ffffff' }))
  p.push(T(W - 40, 82, `${G.stats.total} عنصر · ${G.stats.lengthKm.toFixed(1)} كم · مستخرَج من OpenStreetMap ومقصوص على حدودك المرسومة · 1 بكسل ≈ 1.87 م`, { size: 16, w: 400, color: '#a5f3fc' }))
  p.push(`<circle cx="44" cy="54" r="22" fill="#0d9488"/><path d="M44 38 L44 70 M28 54 L60 54" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`)

  // ═══ اللوحة اليمنى ═══
  const RX = PW + 26, RW = W - RX - 30
  let Y = 122
  const card = (title, rows, { bg = '#ffffff', bd = '#cbd5e1', tc = '#0B4261', h = 0 } = {}) => {
    const ch = h || 52 + rows.length * 34
    p.push(`<rect x="${RX}" y="${Y}" width="${RW}" height="${ch}" rx="14" fill="${bg}" stroke="${bd}" stroke-width="1.4" filter="url(#sh)"/>`)
    p.push(T(RX + RW - 22, Y + 34, title, { size: 19, w: 800, color: tc }))
    rows.forEach(([a, b, col], i) => {
      const yy = Y + 60 + i * 34
      p.push(T(RX + RW - 22, yy + 15, a, { size: 14.5, w: 400, color: '#475569' }))
      p.push(T(RX + 210, yy + 15, b, { size: 15, w: 800, color: col || '#0f172a', anchor: 'end' }))
    })
    Y += ch + 14
  }
  const c = G.stats.byKind
  card('طبقات الطرق', [
    ['شارع رئيسي', `${c.primary} مقطع`, COL.primary.core],
    ['شارع ثانوي', `${c.secondary} مقطع`, COL.secondary.core],
    ['شارع درجة ثالثة', `${c.tertiary} مقطع`, COL.tertiary.core],
    ['شارع فرعي (سكني)', `${c.local} مقطع`, COL.local.core],
    ['زقاق / ممر', `${c.alley} مقطع`, COL.alley.core],
  ], { h: 232 })
  const perM = {}
  for (const k in SRC_NAME) {
    const mm = String(SRC_NAME[k]).match(/^(\d{3})-\d+$/)
    if (mm) perM[mm[1]] = (perM[mm[1]] || 0) + 1
  }
  const topM = Object.entries(perM).sort((a, b) => b[1] - a[1]).slice(0, 5)
  card('المحلات — 14 محلة', topM.map(([m, n]) => [`محلة ${m}`, `${n} عنصراً باسمها`, '#7c3aed']).concat([
    ['+ 9 محلات أخرى', 'كلها في الجدول', '#a855f7'],
  ]), { bg: '#faf5ff', bd: '#d8b4fe', tc: '#6b21a8' })

  card('ملاحظة مهمة على الدقة', [
    ['الحدود', 'مضلّع الزون من قاعدة المنصة', '#0f766e'],
    ['الشوارع', 'من OpenStreetMap ومقصّة على الحدود', '#0369a1'],
    ['المحلات', 'حدودها في OSM مفتوحة', '#b45309'],
  ], { bg: '#fffbeb', bd: '#fde68a' })

  card('ما الذي سيظهر على الخريطة', [
    ['مضلّع الزون', 'حدوده كما رسمتها', '#0f766e'],
    ['الطرق', 'بألوان التصنيف', '#0369a1'],
    ['الأزقة', 'برتقالي فاتح', '#b45309'],
    ['الترقيم', 'ظاهر عند التكبير', '#7c3aed'],
    ['التسمية', '17 شارعاً باسمه', '#0f172a'],
  ], { bg: '#f8fafc', bd: '#cbd5e1' })

  // ═══ شريط الأرقام ═══
  const FY = H - 150
  p.push(`<rect x="0" y="${FY}" width="${W}" height="150" fill="#06263c"/>`)
  const KPI = [
    ['إجمالي العناصر', `${G.stats.total}`, 'ليست تقديرية — مقصوصة على حدودك'],
    ['الأطوال', `${G.stats.lengthKm.toFixed(1)} كم`, 'طول الشبكة داخل الزون'],
    ['الشوارع الرئيسية', `${c.primary}`, 'طارق بن زياد · أبو نؤاس · خالد بن الوليد'],
    ['الأزقة', `${c.alley}`, 'أضيق ما يكون — يبقى محتاجاً تحققاً ميدانياً'],
  ]
  KPI.forEach(([k, v, s], i) => {
    const x = W - 40 - i * 540
    p.push(T(x, FY + 44, k, { size: 15, w: 400, color: '#7dd3fc' }))
    p.push(T(x, FY + 92, v, { size: 40, w: 800, color: '#ffffff' }))
    p.push(T(x, FY + 122, s, { size: 12.5, w: 400, color: '#94a3b8' }))
  })

  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${p.join('\n')}</svg>`, meta: { ox, oy, sc, bb, PW, PY } }
}

// ═══════════ الصورة ٢: تكبير محلة ═══════════
function zoom(mahallaName, id) {
  const W = 2200, H = 1500
  const PW = 1500, PX = 0, PY = 108
  // نافذة تكبير: أكثر ربع حشواً بالأزقة والشوارع داخل الزون
  const az = G.ALL.filter((r) => r.kind === 'alley' || r.kind === 'local')
  const zbb = bboxOf(G.ZONE)
  const cells = new Map()
  for (const r of az) {
    const m = r.pts[Math.floor(r.pts.length / 2)]
    const gx = Math.floor((m[0] - zbb.x0) / 180), gy = Math.floor((m[1] - zbb.y0) / 180)
    const k = gx + ',' + gy
    if (!cells.has(k)) cells.set(k, { n: 0, sx: 0, sy: 0 })
    const c = cells.get(k); c.n++; c.sx += m[0]; c.sy += m[1]
  }
  const hot = [...cells.values()].sort((a, b) => b.n - a.n)[0]
  const hc = [hot.sx / hot.n, hot.sy / hot.n]
  const half = 260
  let bb = { x0: hc[0] - half, y0: hc[1] - half, x1: hc[0] + half, y1: hc[1] + half }
  const pool = G.ALL.filter((r) => r.pts.some((q) => q[0] > bb.x0 && q[0] < bb.x1 && q[1] > bb.y0 && q[1] < bb.y1))
  const php = H - PY - 170
  const sc = Math.min((PW - 60) / (bb.x1 - bb.x0), (php - 40) / (bb.y1 - bb.y0))
  const ox = PX + (PW - (bb.x1 - bb.x0) * sc) / 2
  const oy = PY + (php - (bb.y1 - bb.y0) * sc) / 2

  const p = []
  p.push(`<defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#06263c"/><stop offset="1" stop-color="#0e7490"/></linearGradient>
  <pattern id="g25" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 L 0 0 0 25" fill="none" stroke="#e6eef6" stroke-width="1"/></pattern>
  <pattern id="g125" width="125" height="125" patternUnits="userSpaceOnUse"><path d="M 125 0 L 0 0 0 125" fill="none" stroke="#cfdded" stroke-width="1.6"/></pattern>
  <filter id="sh"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0b2033" flood-opacity="0.14"/></filter></defs>`)
  p.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`)
  p.push(`<rect x="${PX}" y="${PY}" width="${PW}" height="${php}" fill="#f9fcfe"/>`)
  p.push(`<rect x="${PX}" y="${PY}" width="${PW}" height="${php}" fill="url(#g25)"/>`)
  p.push(`<rect x="${PX}" y="${PY}" width="${PW}" height="${php}" fill="url(#g125)"/>`)
  p.push(drawMap({ W: PW, H, ox, oy, sc, bb, roads: pool, labels: true }))

  // أرقام كل عنصر داخل المشهد (هنا يظهر الترقيم)
  const off = {}
  for (const r of pool) {
    const mid = r.pts[Math.floor(r.pts.length / 2)]
    const [x, y] = PF(mid, bb, ox, oy, sc)
    const k = r.kind
    off[k] = (off[k] || 0) + 1
    const col = COL[r.kind].core
    const txt = r.code
    const wpx = txt.length * 8.2 + 14
    p.push(`<rect x="${x - wpx / 2}" y="${y - 26}" width="${wpx}" height="21" rx="5" fill="#ffffff" fill-opacity="0.97" stroke="${col}" stroke-width="1.6"/>`)
    p.push(T(x + wpx / 2 - 7, y - 11, txt, { size: 12.5, w: 800, color: col, anchor: 'end' }))
  }

  p.push(`<rect width="${W}" height="108" fill="url(#hg)"/>`)
  p.push(T(W - 40, 44, 'تكبير على منطقة مكثفة بالأزقة · كل عنصر برقمه المستقل', { size: 30, w: 800, color: '#ffffff' }))
  const nP = pool.filter((r) => r.kind === 'primary').length
  const nA = pool.filter((r) => r.kind === 'alley').length
  p.push(T(W - 40, 80, `${pool.length} عنصر · ${nP} رئيسي · ${nA} زقاق · المقياس ${(1.87 / sc).toFixed(1)} م/بكسل`, { size: 15, w: 400, color: '#a5f3fc' }))

  const RX = PW + 26, RW = W - RX - 30
  let Y = 122
  const card = (title, rows, { bg = '#ffffff', bd = '#cbd5e1', tc = '#0B4261' } = {}) => {
    const ch = 52 + rows.length * 34
    p.push(`<rect x="${RX}" y="${Y}" width="${RW}" height="${ch}" rx="14" fill="${bg}" stroke="${bd}" stroke-width="1.4" filter="url(#sh)"/>`)
    p.push(T(RX + RW - 22, Y + 34, title, { size: 19, w: 800, color: tc }))
    rows.forEach(([a, b, col], i) => {
      const yy = Y + 60 + i * 34
      p.push(T(RX + RW - 22, yy + 15, a, { size: 14, w: 400, color: '#475569' }))
      p.push(T(RX + 230, yy + 15, b, { size: 14.5, w: 800, color: col || '#0f172a', anchor: 'end' }))
    })
    Y += ch + 14
  }
  // جدول العناصر: بطاقة بيانات أول ٦ أزقة
  const sample = pool.filter((r) => r.kind === 'alley').slice(0, 6)
  card('نموذج جدول — كل صف قابل للتعديل', sample.map((r) => [r.code, `${r.mahalla || '—'} · ${Math.round(r.len * 1.87)} م`, COL.alley.core]), { bg: '#fffbeb', bd: '#fcd34d', tc: '#92400e' })
  card('الخطوات', [
    ['١', 'راجع التصنيف: رئيسي/ثانوي/فرعي/زقاق'],
    ['٢', 'أضف الاسم الحقيقي لما تعرفه'],
    ['٣', 'أكِّد المحلة المقترحة أو انقل العنصر'],
    ['٤', 'اسحب أي نقطة لتعديل الشكل'],
  ], { bg: '#ecfdf5', bd: '#6ee7b7', tc: '#065f46' })

  const mx0 = 60, my0 = PY + php - 46, mlen = 100 * sc / 1.87
  p.push(`<rect x="${mx0 - 16}" y="${my0 - 28}" width="${Math.max(mlen + 120, 210)}" height="44" rx="9" fill="#ffffff" fill-opacity="0.94" stroke="#cbd5e1"/>`)
  p.push(`<path d="M${mx0} ${my0} L${mx0 + mlen} ${my0}" stroke="#0f172a" stroke-width="2.6"/>`)
  p.push(`<path d="M${mx0} ${my0 - 6} L${mx0} ${my0 + 6}" stroke="#0f172a" stroke-width="2.6"/>`)
  p.push(`<path d="M${mx0 + mlen} ${my0 - 6} L${mx0 + mlen} ${my0 + 6}" stroke="#0f172a" stroke-width="2.6"/>`)
  p.push(T(mx0 + mlen + 14, my0 + 5, '100 م', { size: 13.5, w: 700, color: '#0f172a', anchor: 'start' }))
  p.push(`<rect x="0" y="${H - 62}" width="${W}" height="62" fill="#06263c"/>`)
  p.push(T(W - 40, H - 22, 'الترقيم مؤقت ويبدأ من ١ داخل كل تصنيف · كل رقم يُثبَّت عند التوثيق ولا يُعاد استخدامه', { size: 15, w: 700, color: '#7dd3fc' }))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${p.join('\n')}</svg>`
}

// ═══════════ التنفيذ ═══════════
;(async () => {
  const o = overview()
  fs.writeFileSync('/tmp/shot/out1.svg', o.svg)
  await sharp(Buffer.from(o.svg), { density: 96 }).flatten({ background: '#fff' }).png({ compressionLevel: 9 }).toFile('/tmp/shot/arkhita-1-overview.png')
  console.log('1 ok')

  // اختر المحلة الأكبر بعدّ العناصر
  const cnt = {}
  for (const r of G.ALL) if (r.mahalla) cnt[r.mahalla] = (cnt[r.mahalla] || 0) + 1
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]
  const target = top ? top[0] : '903'
  console.log('zoom mahalla =', target, 'elements', top && top[1])

  const z = zoom(target)
  fs.writeFileSync('/tmp/shot/out2.svg', z)
  await sharp(Buffer.from(z), { density: 96 }).flatten({ background: '#fff' }).png({ compressionLevel: 9 }).toFile('/tmp/shot/arkhita-2-zoom.png')
  console.log('2 ok')

  const mh = mahallas()
  fs.writeFileSync('/tmp/shot/out3.svg', mh)
  await sharp(Buffer.from(mh), { density: 96 }).flatten({ background: '#fff' }).png({ compressionLevel: 9 }).toFile('/tmp/shot/arkhita-3-mahallas.png')
  console.log('3 ok')

  const sh = EXTRA.sheet({ T, G, SRC_NAME, COL })
  await sharp(Buffer.from(sh), { density: 96 }).flatten({ background: '#fff' }).png({ compressionLevel: 9 }).toFile('/tmp/shot/arkhita-4-sheet.png')
  console.log('4 ok')

  const pn = EXTRA5.panel({ T, G, SRC_NAME, COL, drawMap, PF, bboxOf })
  await sharp(Buffer.from(pn), { density: 96 }).flatten({ background: '#fff' }).png({ compressionLevel: 9 }).toFile('/tmp/shot/arkhita-5-alley.png')
  console.log('5 ok')
})().catch((e) => console.error('ERR', e.stack))

// ═══════════ الصورة ٣: المحلات + خريطة مصغّرة ═══════════
function mahallas() {
  const W = 2200, H = 1340
  const p = []
  p.push(`<defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#06263c"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>
  <filter id="sh"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#4c1d95" flood-opacity="0.14"/></filter></defs>`)
  p.push(`<rect width="${W}" height="${H}" fill="#fcfbff"/>`)
  p.push(`<rect width="${W}" height="108" fill="url(#hg)"/>`)
  p.push(T(W - 40, 46, 'المحلات — أرقامها مكتوبة أصلاً في بيانات الخرائط', { size: 30, w: 800, color: '#ffffff' }))
  p.push(T(W - 40, 84, 'OSM يسمّي كثيراً من الأزقة «رقم المحلة - رقم الزقاق» · لذلك ربط الزقاق بمحلته تلقائي، ومعه حدود المحلة الرسمية (admin_level = 9)', { size: 15, w: 400, color: '#ddd6fe' }))

  const perM = {}
  for (const k in SRC_NAME) {
    const mm = SRC_NAME[k].match(/^(\d{3})-\d+$/)
    if (mm) perM[mm[1]] = (perM[mm[1]] || 0) + 1
  }
  const card = (x, y, w, h, fill, bd) => { p.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${fill}" stroke="${bd}" stroke-width="1.5" filter="url(#sh)"/>`) }

  // ── صف ١: القاعدة (يمين) + جدول الأمثلة (يسار)
  const R1 = 136, R1H = 262
  card(60, R1, 1010, R1H, '#ffffff', '#d8b4fe')
  p.push(T(60 + 990 - 26, R1 + 40, 'كيف نعرف محلة كل زقاق؟', { size: 20, w: 800, color: '#6b21a8' }))
  const lines = [
    'اسم الزقاق في OSM كثيراً ما يكون بهذا النمط:  904-36',
    'الجزء الأول (904) رقم المحلة · والثاني (36) رقم الزقاق داخلها',
    'ربطنا آلياً بالاسم، ولم نعتمد على الهندسة (حدود OSM مفتوحة وغير مكتملة)',
    'وتستطيع نقل أي زقاق إلى محلة أخرى بضغطة إن كان الربط خاطئاً',
  ]
  lines.forEach((l, i) => {
    const yy = R1 + 84 + i * 46
    p.push(`<circle cx="${60 + 990 - 38}" cy="${yy - 6}" r="7" fill="#a855f7"/>`)
    p.push(T(60 + 990 - 56, yy, l, { size: 15.5, w: 400, color: '#3b0764' }))
  })

  const TX = 1100, TW = W - TX - 60
  card(TX, R1, TW, R1H, '#f5f3ff', '#c4b5fd')
  p.push(T(TX + TW - 26, R1 + 38, 'أمثلة حقيقية من البيانات المستخرجة', { size: 18, w: 800, color: '#5b21b6' }))
  p.push(T(TX + TW - 26, R1 + 66, 'الاسم في المصدر', { size: 12.5, w: 700, color: '#7c3aed' }))
  p.push(T(TX + 300, R1 + 66, 'المحلة', { size: 12.5, w: 700, color: '#7c3aed', anchor: 'end' }))
  p.push(T(TX + 130, R1 + 66, 'التصنيف', { size: 12.5, w: 700, color: '#7c3aed', anchor: 'end' }))
  const ex = [['903-77', '903', 'أزقّة'], ['904-36', '904', 'أزقّة'], ['901-1', '901', 'أزقّة'], ['929-11', '929', 'أزقّة'], ['931-13', '931', 'أزقّة'], ['102-55', '102', 'محلي']]
  ex.forEach(([n, m, k], i) => {
    const yy = R1 + 96 + i * 27
    p.push(`<rect x="${TX + 16}" y="${yy - 13}" width="${TW - 32}" height="24" rx="6" fill="${i % 2 ? '#ffffff' : '#ede9fe'}"/>`)
    p.push(T(TX + TW - 26, yy + 5, n, { size: 14.5, w: 800, color: '#4c1d95' }))
    p.push(T(TX + 300, yy + 5, `محلة ${m}`, { size: 13.5, w: 800, color: '#7c3aed', anchor: 'end' }))
    p.push(T(TX + 130, yy + 5, k, { size: 13, w: 400, color: '#6b7280', anchor: 'end' }))
  })

  // ── صف ٢: شرائح المحلات
  const R2 = R1 + R1H + 26
  p.push(T(W - 60, R2 + 6, 'المحلات التي ظهر رقمها في البيانات — والعدد الحقيقي لما سُمّي منها', { size: 19, w: 800, color: '#4c1d95' }))
  const allM = ['901', '902', '903', '904', '905', '906', '907', '908', '909', '925', '929', '931', '102', '911']
  const gap = 12, bw = (W - 120 - (allM.length - 1) * gap) / allM.length
  allM.forEach((m, i) => {
    const x = W - 60 - (i + 1) * bw - i * gap
    const n = perM[m] || 0
    const hot = n >= 30 ? '#7c3aed' : n >= 10 ? '#a855f7' : '#c4b5fd'
    p.push(`<rect x="${x}" y="${R2 + 30}" width="${bw}" height="104" rx="12" fill="#ffffff" stroke="#d8b4fe" stroke-width="1.4"/>`)
    p.push(T(x + bw / 2, R2 + 78, m, { size: 27, w: 800, color: '#5b21b6', anchor: 'middle' }))
    p.push(`<rect x="${x + bw / 2 - 22}" y="${R2 + 90}" width="44" height="5" rx="2.5" fill="${hot}"/>`)
    p.push(T(x + bw / 2, R2 + 116, `${n} زقاقاً`, { size: 12, w: 700, color: '#7c3aed', anchor: 'middle' }))
  })

  // ── صف ٣: الجدول المزدوج
  const R3 = R2 + 152
  const sorted = Object.entries(perM).sort((a, b) => b[1] - a[1])
  const R3H = 96 + Math.ceil(sorted.length / 2) * 40
  card(60, R3, W - 120, R3H, '#ffffff', '#e9d5ff')
  p.push(T(W - 88, R3 + 40, 'ترتيب المحلات بعدد الأزقة المسجّلة باسمها', { size: 20, w: 800, color: '#4c1d95' }))
  const colw = (W - 140) / 2
  sorted.forEach(([m, n], i) => {
    const left = i % 2 === 0
    const row = Math.floor(i / 2)
    const xRight = W - 96 - (left ? 0 : colw)
    const yy = R3 + 76 + row * 40
    p.push(`<rect x="${xRight - colw + 12}" y="${yy - 18}" width="${colw - 24}" height="34" rx="7" fill="${row % 2 ? '#faf5ff' : '#f5f3ff'}"/>`)
    p.push(T(xRight - 6, yy + 6, `محلة ${m}`, { size: 15.5, w: 800, color: '#5b21b6' }))
    const barw = Math.max(5, (n / sorted[0][1]) * (colw * 0.42))
    p.push(`<rect x="${xRight - colw + 108}" y="${yy - 8}" width="${barw}" height="15" rx="7.5" fill="#c4b5fd"/>`)
    p.push(T(xRight - colw + 102 + barw, yy + 6, `${n}`, { size: 14, w: 800, color: '#7c3aed', anchor: 'start' }))
  })

  // ── صف ٤: ما المطلوب
  const R4 = R3 + R3H + 26
  const qs = [
    ['الألوان والتصنيف', 'رئيسي ذهبي · ثانوي بنفسجي · ثالثة وردي · محلي أزرق · زقاق برتقالي'],
    ['الترقيم', 'STR / SEC / TRC / LOC / ALY ثم أربعة أرقام، يبدأ من ١ في كل تصنيف داخل الزون'],
    ['عرض المحلة مع الزقاق', 'كل سطر في الجدول يحمل محلته، وتنتقل بين المحلات وتضغط الزقاق فتراه'],
    ['التعديل', 'كل اسم وتصنيف ومحلة وطول ومساحة قابلة للتعديل من شاشة التخطيط'],
  ]
  qs.forEach(([q, a], i) => {
    const x = W - 60 - i * ((W - 120) / 4)
    const wpx = (W - 120) / 4 - 18
    card(x - wpx, R4, wpx, 138, i === 3 ? '#4c1d95' : '#ffffff', i === 3 ? '#4c1d95' : '#ddd6fe')
    p.push(T(x - 24, R4 + 38, `${i + 1}`, { size: 26, w: 800, color: i === 3 ? '#c4b5fd' : '#c4b5fd' }))
    p.push(T(x - 24, R4 + 74, q, { size: 17, w: 800, color: i === 3 ? '#ffffff' : '#1e1b4b' }))
    p.push(T(x - 24, R4 + 104, a, { size: 12.5, w: 400, color: i === 3 ? '#ddd6fe' : '#52525b' }))
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${p.join('\n')}</svg>`
}
