// ═══════════ الصور ٤ و٥: الجدول القابل للتعديل + لوحة الزقاق ═══════════
const KIND_AR = { primary: 'رئيسي', secondary: 'ثانوي', tertiary: 'ثالثة', local: 'محلي', alley: 'زقاق' }
module.exports = { sheet: (cx) => sheet(cx) }


function sheet({ T, G, SRC_NAME, COL }) {
  const mOf = (r) => { const n = SRC_NAME[r.id] || ''; const m = n.match(/^(\d{3})-\d+$/); return m ? m[1] : '—' }
  const nameOf = (r) => SRC_NAME[r.id] || '—'
  const W = 2200, H = 1500
  const p = []
  p.push(`<defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#083344"/><stop offset="1" stop-color="#0e7490"/></linearGradient>
  <filter id="sh"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.12"/></filter></defs>`)
  p.push(`<rect width="${W}" height="${H}" fill="#f4f7fa"/>`)
  p.push(`<rect width="${W}" height="112" fill="url(#tg)"/>`)
  p.push(T(W - 44, 48, 'جدول العناصر — كله قابل للتعديل', { size: 30, w: 800, color: '#fff' }))
  p.push(T(W - 44, 86, 'شاشة واحدة تجمع كل ما استُخرج: الكود · الاسم · التصنيف · المحلة · الطول · الحالة · ملاحظة', { size: 15, w: 400, color: '#a5f3fc' }))

  // شريط أدوات + مرشحات
  const fb = (x, y, w, t, on) => {
    p.push(`<rect x="${x - w}" y="${y}" width="${w}" height="38" rx="19" fill="${on ? '#0e7490' : '#fff'}" stroke="${on ? '#0e7490' : '#cbd5e1'}" stroke-width="1.5"/>`)
    p.push(T(x - w / 2 - 4, y + 25, t, { size: 14.5, w: 700, color: on ? '#fff' : '#334155', anchor: 'middle' }))
  }
  const FX = W - 44, FY = 136
  p.push(`<rect x="56" y="${FY}" width="${W - 100}" height="62" rx="12" fill="#ffffff" stroke="#e2e8f0" filter="url(#sh)"/>`)
  let x = FX - 12
  for (const [t, on] of [['كل التصنيفات', true], ['رئيسي', false], ['ثانوي', false], ['محلي', false], ['زقاق', false]]) {
    const w = t.length * 9 + 40
    fb(x, FY + 12, w, t, on); x -= w + 8
  }
  // بحث
  p.push(`<rect x="76" y="${FY + 12}" width="330" height="38" rx="19" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.4"/>`)
  p.push(T(76 + 316, FY + 38, 'ابحث باسم الزقاق أو الكود أو المحلة…', { size: 14, w: 400, color: '#94a3b8' }))
  p.push(T(76 + 316, FY + 38, '', {}))
  p.push(`<circle cx="96" cy="${FY + 31}" r="7" fill="none" stroke="#94a3b8" stroke-width="2"/>`)
  p.push(`<path d="M101 ${FY + 36} l6 6" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>`)

  // ترويسة الجدول — بعرض أعمدة ثابت ومحاذاة موحّدة
  const TY = FY + 86
  const COLS = [
    ['الكود', 150], ['الاسم في المصدر', 300], ['التصنيف', 120],
    ['المحلة', 120], ['الطول', 110], ['الحالة', 130], ['ملاحظة المسّاح', 230],
  ]
  const rightEdge = FX - 6
  const pos = []
  let acc = rightEdge
  for (const [t, w] of COLS) { pos.push({ t, right: acc, w }); acc -= w }
  p.push(`<rect x="56" y="${TY}" width="${W - 100}" height="52" rx="10" fill="#0f172a"/>`)
  pos.forEach((c) => p.push(T(c.right, TY + 34, c.t, { size: 14, w: 800, color: '#e2e8f0' })))

  // صفوف مختارة: شوارع رئيسية مسمّاة + أزقة مسمّاة (مزيج يعرض كل الحقول)
  const byName = (k) => G.ALL.filter((r) => SRC_NAME[r.id] && /^\d{3}-\d+$/.test(SRC_NAME[r.id]) && r.kind === k)
  const majors = G.ALL.filter((r) => r.kind === 'primary' && r.len > 250).sort((a, b) => b.len - a.len).slice(0, 4)
  const secs = G.ALL.filter((r) => r.kind === 'secondary' && r.len > 120).sort((a, b) => b.len - a.len).slice(0, 2)
  const al = byName('alley')
  const lo = byName('local')
  const rows = [...majors, ...secs, ...al.slice(0, 5), ...lo.slice(0, 5), ...al.slice(5, 11), ...lo.slice(5, 11), ...al.slice(11, 15)]

  const RH = 46
  rows.forEach((r, i) => {
    const yy = TY + 52 + i * RH
    p.push(`<rect x="56" y="${yy}" width="${W - 100}" height="${RH}" fill="${i % 2 ? '#ffffff' : '#f8fafc'}"/>`)
    const isSel = i === 2
    if (isSel) p.push(`<rect x="56" y="${yy}" width="${W - 100}" height="${RH}" fill="#cffafe" stroke="#0891b2" stroke-width="2"/>`)
    const [c0, c1, c2, c3, c4, c5, c6] = pos
    // الكود
    p.push(T(c0.right, yy + 30, r.code, { size: 14.5, w: 800, color: '#0e7490' }))
    // الاسم
    const nm = SRC_NAME[r.id] || (r.kind === 'primary' ? 'يحتاج تسمية' : '—')
    p.push(T(c1.right, yy + 30, nm, { size: 14.5, w: 700, color: nm === '—' ? '#94a3b8' : '#0f172a' }))
    // التصنيف
    p.push(`<rect x="${c2.right - 84}" y="${yy + 10}" width="84" height="26" rx="13" fill="${COL[r.kind].halo}" stroke="${COL[r.kind].core}" stroke-width="1.2"/>`)
    p.push(T(c2.right - 42, yy + 28, KIND_AR[r.kind], { size: 12.5, w: 700, color: COL[r.kind].core, anchor: 'middle' }))
    // المحلة
    const mh = mOf(r)
    if (mh !== '—') p.push(T(c3.right, yy + 30, `محلة ${mh}`, { size: 14.5, w: 800, color: '#7c3aed' }))
    else p.push(T(c3.right, yy + 30, r.kind === 'primary' || r.kind === 'secondary' ? 'عدة محلات' : 'غير محددة', { size: 13, w: 500, color: '#94a3b8' }))
    // الطول
    p.push(T(c4.right, yy + 30, `${r.len.toFixed(0)} م`, { size: 14.5, w: 700, color: '#334155' }))
    // الحالة
    const st = [['مؤكد', '#15803d', '#dcfce7'], ['غير مؤكد', '#b45309', '#fef3c7'], ['لا قراءة', '#64748b', '#f1f5f9']][(i * 2 + 1) % 3]
    p.push(`<rect x="${c5.right - 96}" y="${yy + 10}" width="96" height="26" rx="13" fill="${st[2]}"/>`)
    p.push(`<circle cx="${c5.right - 82}" cy="${yy + 23}" r="4" fill="${st[1]}"/>`)
    p.push(T(c5.right - 16, yy + 28, st[0], { size: 12.5, w: 700, color: st[1] }))
    // ملاحظة
    const notes = ['مسح ميداني', 'يحتاج تحقق', '', 'محجوز باسم المحلة', 'مقطع مكرر؟', '', 'يحتاج تحقق']
    p.push(T(c6.right, yy + 30, notes[i % notes.length], { size: 13, w: 400, color: '#64748b' }))
  })

  // شريط سفلي: تلميح
  const BY = TY + 52 + rows.length * RH + 20
  p.push(`<rect x="56" y="${BY}" width="${W - 100}" height="86" rx="12" fill="#ecfeff" stroke="#a5f3fc"/>`)
  p.push(T(W - 76, BY + 36, 'كيف تعدّل؟', { size: 17, w: 800, color: '#155e75' }))
  p.push(T(W - 76, BY + 64, 'اضغط أي خلية فتصبح قابلة للكتابة · الكود لا يتغيّر أبداً · كل تعديل يُسجَّل باسمك ووقته، ويمكن الرجوع عنه', { size: 14, w: 400, color: '#0e7490' }))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${p.join('\n')}</svg>`
}
