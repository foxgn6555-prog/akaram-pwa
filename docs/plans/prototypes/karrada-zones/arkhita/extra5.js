module.exports = { panel: (o) => panel(o) }
function panel({ T, G, SRC_NAME, COL, drawMap, PF, bboxOf }) {
  const W = 2200, H = 1345
  const p = []
  p.push(`<defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#052e16"/><stop offset="1" stop-color="#15803d"/></linearGradient>
  <filter id="sh"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#064e3b" flood-opacity="0.15"/></filter></defs>`)
  p.push(`<rect width="${W}" height="${H}" fill="#fbfefc"/>`)
  p.push(`<rect width="${W}" height="110" fill="url(#pg)"/>`)
  p.push(T(W - 44, 47, 'لوحة الزقاق — حين تختار زقاقاً واحداً', { size: 30, w: 800, color: '#fff' }))
  p.push(T(W - 44, 85, 'تظهر كل بياناته، وأهمّها محلته — ويُبرَز على الخريطة بجيرانه', { size: 15, w: 400, color: '#bbf7d0' }))

  const card = (x, y, w, h, f, b) => p.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${f}" stroke="${b}" stroke-width="1.5" filter="url(#sh)"/>`)

  // اختَر زقاقاً حقيقياً مسمّى
  const named = G.ALL.filter((r) => r.kind === 'alley' && /^\d{3}-\d+$/.test(SRC_NAME[r.id] || '') && r.len > 25)
  const sel = named.sort((a, b) => b.len - a.len)[0]
  const mh = (SRC_NAME[sel.id] || '').split('-')[0]

  // ── الخريطة (يمين واسع)
  const MX = 700, MY = 140, MW = W - MX - 60, MH = 620
  card(MX, MY, MW, MH, '#ffffff', '#bbf7d0')
  p.push(`<clipPath id="cp"><rect x="${MX + 2}" y="${MY + 2}" width="${MW - 4}" height="${MH - 4}" rx="15"/></clipPath>`)
  const half = 95
  const mid = sel.pts[Math.floor(sel.pts.length / 2)]
  const bb = { x0: mid[0] - half, y0: mid[1] - half, x1: mid[0] + half, y1: mid[1] + half }
  const sc = Math.min((MW - 40) / (bb.x1 - bb.x0), (MH - 40) / (bb.y1 - bb.y0))
  const ox = MX + (MW - (bb.x1 - bb.x0) * sc) / 2
  const oy = MY + (MH - (bb.y1 - bb.y0) * sc) / 2
  p.push(`<g clip-path="url(#cp)">`)
  p.push(drawMap({ W: MW, H: MH, ox, oy, sc, bb, roads: G.ALL, labels: false, zoneWidth: 0, grid: true }))
  // إبراز الزقاق المختار
  const d = sel.pts.map(([x, y], i) => { const [px, py] = PF([x, y], bb, ox, oy, sc); return (i ? 'L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1) }).join(' ')
  p.push(`<path d="${d}" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`)
  p.push(`<path d="${d}" fill="none" stroke="#16a34a" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`)
  for (const [i, pt] of [[0, sel.pts[0]], ['e', sel.pts[sel.pts.length - 1]]]) {
    const [px, py] = PF(pt, bb, ox, oy, sc)
    p.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="11" fill="#fff" stroke="#16a34a" stroke-width="5"/>`)
  }
  p.push(`</g>`)
  p.push(`<rect x="${MX}" y="${MY}" width="${MW}" height="${MH}" rx="16" fill="none" stroke="#bbf7d0" stroke-width="1.5"/>`)
  // شريط داخل الخريطة
  p.push(`<rect x="${MX + 20}" y="${MY + 20}" width="430" height="58" rx="10" fill="#052e16" fill-opacity="0.88"/>`)
  p.push(T(MX + 430, MY + 44, `الزقاق المختار: ${sel.code}`, { size: 17, w: 800, color: '#ffffff' }))
  p.push(T(MX + 430, MY + 66, `${SRC_NAME[sel.id]} · محلة ${mh} · ${sel.len.toFixed(0)} م`, { size: 13, w: 400, color: '#86efac' }))

  // ── لوحة البيانات (يسار)
  const PX = 60, PY = 140, PW = MX - 60 - 60, PH = 620
  card(PX, PY, PW, PH, '#ffffff', '#d1fae5')
  p.push(T(PX + PW - 26, PY + 44, 'بيانات الزقاق', { size: 21, w: 800, color: '#065f46' }))
  p.push(`<line x1="${PX + 24}" y1="${PY + 62}" x2="${PX + PW - 24}" y2="${PY + 62}" stroke="#e2e8f0" stroke-width="1.5"/>`)
  const fields = [
    ['الكود', sel.code, '#0e7490', false],
    ['الاسم في المصدر', SRC_NAME[sel.id], '#0f172a', true],
    ['المحلة', `محلة ${mh}`, '#7c3aed', true],
    ['التصنيف', 'زقاق', '#b45309', true],
    ['الطول', `${sel.len.toFixed(0)} م`, '#0f172a', false],
    ['الاتجاه', 'ذو اتجاهين', '#334155', true],
    ['نقطة الدخول', 'عقدة على شارع 903-1', '#334155', false],
    ['نقطة الخروج', 'عقدة على شارع 903-3', '#334155', false],
  ]
  fields.forEach(([k, v, col, editable], i) => {
    const yy = PY + 96 + i * 62
    if (i) p.push(`<line x1="${PX + 24}" y1="${yy - 26}" x2="${PX + PW - 24}" y2="${yy - 26}" stroke="#f1f5f9" stroke-width="1.5"/>`)
    // التسمية على اليمين، القيمة على اليسار — سطر واحد لكل حقل
    p.push(T(PX + PW - 28, yy + 8, k, { size: 13.5, w: 500, color: '#94a3b8' }))
    const isEditing = i === 2
    if (isEditing) {
      p.push(`<rect x="${PX + 24}" y="${yy - 12}" width="270" height="34" rx="7" fill="#faf5ff" stroke="#a855f7" stroke-width="2"/>`)
      p.push(T(PX + 24 + 254, yy + 10, v, { size: 16, w: 800, color: '#6b21a8' }))
      p.push(`<path d="M${PX + 40} ${yy + 5} l5 5 l-5 5" fill="none" stroke="#a855f7" stroke-width="2.4" stroke-linecap="round"/>`)
    } else {
      p.push(T(PX + 24 + 250, yy + 10, v, { size: 16.5, w: 800, color: col }))
      if (editable) p.push(`<path d="M${PX + 38} ${yy + 3} l5 5 l-5 5" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>`)
    }
  })
  p.push(T(PX + PW - 26, PY + PH - 18, 'الحقل المحدد (المحلة) قابل للتعديل الآن — اضغط لتغييره', { size: 12.5, w: 400, color: '#a855f7' }))

  // ── شريط سفلي: الحالة GPS + الحقول المقترحة
  const BY = 790
  const bw = (W - 120 - 2 * 24) / 3
  const boxes = [
    ['حالة التوثيق', ['مؤكد بمسح ميداني', 'غير مؤكد — لم يُمسح', 'لا توجد قراءة GPS'], '#16a34a', 'يعتمد على قراءات آليات النظافة'],
    ['ما يُحفظ في اللوحة', ['الكود والاسم', 'التصنيف والمحلة', 'الطول والحالة'], '#0e7490', 'لا يُخزَّن المسار الكامل أبداً'],
    ['ما تستطيع تعديله', ['الاسم والتصنيف', 'المحلة والاتجاه', 'نقاط الدخول والخروج'], '#7c3aed', 'الكود يبقى ثابتاً بعد التوثيق'],
  ]
  boxes.forEach(([t, items, col, note], i) => {
    const x = W - 60 - i * (bw + 24)
    card(x - bw, BY, bw, 212, '#ffffff', '#e2e8f0')
    p.push(`<rect x="${x - bw}" y="${BY}" width="${bw}" height="7" rx="3.5" fill="${col}"/>`)
    p.push(T(x - 24, BY + 48, t, { size: 19, w: 800, color: col }))
    items.forEach((it, j) => {
      const yy = BY + 86 + j * 37
      p.push(`<circle cx="${x - 36}" cy="${yy - 5}" r="5" fill="${col}"/>`)
      p.push(T(x - 50, yy, it, { size: 15, w: 600, color: '#334155' }))
    })
    p.push(T(x - 24, BY + 190, note, { size: 12, w: 400, color: '#94a3b8' }))
  })

  // ── آخر شريط: العلاقة هرَميّة
  const LY = 1040
  card(60, LY, W - 120, 250, '#052e16', '#052e16')
  p.push(T(W - 88, LY + 46, 'الترتيب الذي بنيناه — ولا يتغيّر', { size: 20, w: 800, color: '#ffffff' }))
  const lv = [
    ['الزون', 'الأرخيته', '#86efac'],
    ['المحلة', `محلة ${mh}`, '#a7f3d0'],
    ['الشارع الرئيسي', 'يسكنه الزون كله', '#7dd3fc'],
    ['الزقاق', sel.code, '#fcd34d'],
  ]
  lv.forEach(([a, b, col], i) => {
    const x = W - 88 - i * ((W - 200) / 4)
    p.push(`<rect x="${x - (W - 200) / 4 + 20}" y="${LY + 72}" width="${(W - 200) / 4 - 34}" height="104" rx="12" fill="#ffffff" fill-opacity="0.07" stroke="${col}" stroke-width="1.6"/>`)
    p.push(T(x - 34, LY + 106, a, { size: 13.5, w: 500, color: col }))
    p.push(T(x - 34, LY + 146, b, { size: 19, w: 800, color: '#ffffff' }))
    if (i < 3) p.push(`<path d="M${x - (W - 200) / 4 - 2} ${LY + 124} l-14 0 M${x - (W - 200) / 4 - 8} ${LY + 119} l-6 5 l6 5" fill="none" stroke="#86efac" stroke-width="2.2" stroke-linecap="round"/>`)
  })
  p.push(T(W - 88, LY + 216, 'كل زقاق ينتمي إلى محلة واحدة · وكل محلة داخل زون واحد · والزقاق يظهر دائماً ومعه محلته', { size: 14.5, w: 400, color: '#86efac' }))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${p.join('\n')}</svg>`
}
