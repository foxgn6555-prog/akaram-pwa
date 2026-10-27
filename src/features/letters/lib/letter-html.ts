/**
 * 00356 — قالب الكتاب الرسمي الموحد (شركة جزيرة الأكارم): رأس بشعاري الشركة وأمانة بغداد، رقم وتاريخ، نوع الكتاب،
 * الموضوع، فقرات النص، جدول بيانات الموظف، جدول بنود التصفية (لكتاب التصفية)، توقيع المدير المفوض، تذييل.
 * يُعرض داخل iframe للمعاينة ويُطبع/يُحفظ PDF من نافذة مستقلة. الأرقام إنكليزية (0-9).
 */
import type { OfficialLetter } from '@features/hr/types'

const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const money = (n: unknown): string => (n == null || n === '' || Number.isNaN(Number(n)) ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(n)))
const num = (n: unknown): string => (n == null || n === '' ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }))
const base = (): string => { const env = (typeof import.meta !== 'undefined' ? import.meta : {}) as { env?: { BASE_URL?: string } }; return env.env?.BASE_URL ?? '/' }
export const LETTER_LOGOS = { company: 'report-assets/logo-company.png', baghdad: 'report-assets/logo-baghdad.png' }

export const LETTER_KIND_LABELS: Record<string, string> = {
  resignation_accept: 'قبول استقالة', termination: 'إنهاء خدمات', dismissal: 'فصل من الخدمة', contract_end: 'انتهاء عقد', retirement: 'إحالة إلى التقاعد', death: 'إنهاء خدمة (وفاة)', settlement: 'تصفية نهاية الخدمة',
  thanks: 'شكر وتقدير', notice: 'تنبيه', warning: 'إنذار',   // 00357
}
const ADMIN_KINDS = new Set(['thanks', 'notice', 'warning'])

function settlementTable(p: Record<string, unknown>): string {
  const adv = Array.isArray(p.advances) ? (p.advances as Array<Record<string, unknown>>) : []
  const net = Number(p.net ?? 0)
  return `
    <div class="sect">بنود التصفية النهائية</div>
    <table class="items">
      <thead><tr><th class="c-num">ت</th><th>البند</th><th>التفصيل</th><th class="c-amt">المبلغ (د.ع)</th></tr></thead>
      <tbody>
        <tr><td class="c-num">1</td><td>راتب شهر الإنهاء حتى آخر يوم عمل</td><td>${p.salary_source === 'paid_in_sheet' ? 'صُرف ضمن كشف الشهر المعتمد' : `${num(p.salary_days)} يوم مستحق × ${money(p.day_rate)}`}</td><td class="num">${money(p.salary_net)}</td></tr>
        <tr><td class="c-num">2</td><td>تعويض رصيد الإجازات المتبقي</td><td>${num(p.leave_days)} يوم × ${money(p.day_rate)}</td><td class="num">${money(p.leave_amount)}</td></tr>
        <tr><td class="c-num">3</td><td>السلف غير المسددة (تُستقطع)</td><td>${adv.length === 0 ? 'لا سلف مفتوحة' : adv.map((a) => `${esc(a.ref_no)}: متبقٍ ${money(a.remaining)}`).join(' · ')}</td><td class="num neg">− ${money(p.advances_total)}</td></tr>
      </tbody>
      <tfoot><tr><th colspan="3">${net < 0 ? 'ذمة على الموظف' : 'صافي التصفية المستحق للموظف'}</th><th class="num ${net < 0 ? 'neg' : 'pos'}">${money(Math.abs(net))}</th></tr></tfoot>
    </table>`
}

/** جسم الكتاب (بلا <html>) */
export function letterBodyHtml(l: OfficialLetter): string {
  const p = (l.payload ?? {}) as Record<string, unknown>
  const body = Array.isArray(l.body) ? l.body : []
  const issued = l.issued_date ?? (l.issued_at ?? '').slice(0, 10)
  return `
  <div class="doc doc-${esc(l.kind)}" dir="rtl">
    <div class="masthead">
      <img class="logo" src="${base()}${LETTER_LOGOS.company}" alt="شعار شركة جزيرة الأكارم" />
      <div class="org">
        <div class="bismillah">بسم الله الرحمن الرحيم</div>
        <div class="name">شركة جزيرة الأكارم</div>
        <div class="sub">الإدارة العامة — مكتب المدير المفوض</div>
      </div>
      <img class="logo" src="${base()}${LETTER_LOGOS.baghdad}" alt="شعار أمانة بغداد" />
    </div>
    <div class="refrow">
      <div class="refbox"><span class="k">العدد:</span> <span class="v">${esc(l.ref)}</span></div>
      <div class="docbadge">${esc(l.kind_label)}</div>
      <div class="refbox"><span class="k">التاريخ:</span> <span class="v">${esc(issued)}</span></div>
    </div>
    <p class="to">إلى / ${esc(l.full_name)}${l.job_title ? ` — ${esc(l.job_title)}` : ''}${l.department_name ? ` / ${esc(l.department_name)}` : ''}</p>
    <p class="subject">م / ${esc(l.subject)}</p>
    <div class="body">
      <p class="greet">تحية طيبة…</p>
      ${body.map((t) => `<p>${esc(t)}</p>`).join('')}
    </div>
    <table class="meta">
      <tr><th>اسم الموظف</th><td>${esc(l.full_name)}</td><th>الرقم الوظيفي</th><td class="num">${esc(l.employee_number ?? '—')}</td></tr>
      <tr><th>القسم</th><td>${esc(l.department_name ?? '—')}</td><th>العنوان الوظيفي</th><td>${esc(l.job_title ?? '—')}</td></tr>
      ${ADMIN_KINDS.has(l.kind)
        ? `<tr><th>تاريخ التعيين</th><td class="num">${esc(l.hire_date ?? '—')}</td><th>${l.kind === 'thanks' ? 'رقم المكافأة' : 'التسلسل في السجل'}</th><td class="num">${l.kind === 'thanks' ? esc(p.reward_ref ?? '—') : String(Number(p.prior_count ?? 0) + 1)}</td></tr>`
        : `<tr><th>تاريخ التعيين</th><td class="num">${esc(l.hire_date ?? '—')}</td><th>آخر يوم عمل</th><td class="num">${esc(p.last_day ?? '—')}</td></tr>`}
      ${p.service_years != null ? `<tr><th>مدة الخدمة</th><td class="num">${num(p.service_years)} سنة</td><th>نوع الإنهاء</th><td>${esc(p.termination_label ?? '—')}</td></tr>` : ''}
    </table>
    ${l.kind === 'settlement' ? settlementTable(p) : ''}
    <p class="closing">… مع التقدير</p>
    <div class="sign">
      <div class="sign-block">
        <div class="sign-name">${esc(l.signer_name ?? l.signer_title)}</div>
        <div class="sign-title">${esc(l.signer_title)}</div>
        <div class="sign-date">${esc(issued)}</div>
      </div>
    </div>
    <div class="cc">نسخة منه إلى: ${ADMIN_KINDS.has(l.kind) ? '' : 'الشؤون المالية · '}الموارد البشرية${p.manager_name ? ` · المدير المباشر (${esc(p.manager_name)})` : ''} · الإضبارة الشخصية</div>
    <p class="foot">كتاب رسمي صادر آلياً من نظام شركة جزيرة الأكارم — رقم ${esc(l.ref)} — لا يُعدَّل بعد صدوره</p>
  </div>`
}

export const LETTER_CSS = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI','Cairo',Tahoma,sans-serif; color:#0f172a; margin:0; background:#eef2f6; }
  .doc { max-width:800px; margin:16px auto; background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:26px 32px; box-shadow:0 8px 28px rgba(15,23,42,.10); position:relative; }
  .masthead { display:flex; align-items:center; justify-content:space-between; gap:14px; border-bottom:3px double #0b3d6b; padding-bottom:12px; }
  .masthead .logo { width:86px; height:70px; object-fit:contain; }
  .org { flex:1; text-align:center; }
  .org .bismillah { font-size:12px; color:#64748b; }
  .org .name { font-size:22px; font-weight:900; color:#0b3d6b; letter-spacing:.2px; }
  .org .sub { font-size:12px; color:#64748b; margin-top:2px; }
  .refrow { display:flex; justify-content:space-between; align-items:center; margin:12px 0 10px; }
  .refbox { font-size:13px; color:#334155; } .refbox .k { font-weight:700; } .refbox .v { font-weight:800; direction:ltr; display:inline-block; font-family:monospace; font-size:14px; }
  .docbadge { font-size:15px; font-weight:900; color:#0b3d6b; border:2px solid #c9a227; border-radius:10px; padding:5px 18px; background:#fffaf0; }
  .doc-thanks .docbadge { color:#7a5a00; background:linear-gradient(180deg,#fff8dc,#f7e7a8); border-color:#c9a227; }
  .doc-thanks .body p:first-of-type + p { font-weight:700; }
  .doc-notice .docbadge { color:#9a3412; border-color:#ea580c; background:#fff7ed; }
  .doc-warning .docbadge { color:#991b1b; border-color:#dc2626; background:#fef2f2; }
  .to { font-size:14.5px; font-weight:700; margin:12px 0 2px; }
  .subject { font-size:14.5px; font-weight:800; margin:0 0 8px; text-decoration:underline; text-underline-offset:4px; }
  .body { font-size:14.5px; line-height:2.05; text-align:justify; }
  .body .greet { margin:0; font-weight:700; }
  .body p { margin:4px 0; }
  table.meta, table.items { width:100%; border-collapse:collapse; margin:12px 0; }
  table.meta th, table.meta td { border:1.2px solid #cbd5e1; padding:7px 10px; font-size:13px; }
  table.meta th { background:#eef4fa; color:#0b3d6b; text-align:right; width:17%; font-weight:700; }
  table.meta td { font-weight:600; width:33%; }
  .sect { display:inline-block; background:#0b3d6b; color:#fff; border-radius:8px; padding:4px 16px; font-size:12.5px; font-weight:700; margin:4px 0 6px; }
  table.items th, table.items td { border:1.2px solid #94a3b8; padding:8px 10px; font-size:13px; text-align:right; }
  table.items thead th { background:#0b3d6b; color:#fff; text-align:center; }
  table.items tfoot th { background:#fffaf0; font-size:14px; }
  .c-num { width:40px; text-align:center !important; } .c-amt { width:150px; }
  .num { direction:ltr; text-align:left !important; font-family:monospace; font-weight:800; font-size:14px; }
  .neg { color:#b91c1c; } .pos { color:#047857; }
  .closing { text-align:left; font-weight:700; margin:10px 0 0; }
  .sign { display:flex; justify-content:flex-start; margin-top:18px; }
  .sign-block { text-align:center; min-width:240px; margin-right:auto; }
  .sign-name { font-weight:900; font-size:15px; margin-bottom:2px; }
  .sign-title { font-size:13px; color:#0b3d6b; font-weight:700; }
  .sign-date { font-size:12px; color:#64748b; direction:ltr; margin-top:22px; }
  .cc { margin-top:26px; font-size:11.5px; color:#475569; border-top:1px dashed #cbd5e1; padding-top:8px; }
  .foot { margin-top:14px; text-align:center; font-size:10.5px; color:#94a3b8; }
  .noprint { text-align:center; margin:16px 0; }
  @media print { body { background:#fff; } .doc { box-shadow:none; border:none; border-radius:0; margin:0; padding:0; } .noprint { display:none; } }
`

/** مستند HTML كامل (معاينة أو طباعة) */
export function letterDocumentHtml(l: OfficialLetter, opts: { autoPrint?: boolean } = {}): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" /><title>كتاب ${esc(l.ref)} — ${esc(l.kind_label)}</title><style>${LETTER_CSS}</style></head><body>
  ${letterBodyHtml(l)}
  ${opts.autoPrint ? `<div class="noprint"><button onclick="window.print()" style="padding:10px 26px;font-size:15px;cursor:pointer;border:none;border-radius:8px;background:#0b3d6b;color:#fff">طباعة / حفظ PDF</button></div><script>window.onload=function(){setTimeout(function(){window.print();},400);}</script>` : ''}
  </body></html>`
}

/** فتح نافذة الطباعة (حفظ PDF من حوار الطباعة) */
export function printLetter(l: OfficialLetter): void {
  const win = window.open('', '_blank', 'width=900,height=1000')
  if (!win) throw new Error('تعذّر فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة')
  win.document.write(letterDocumentHtml(l, { autoPrint: true }))
  win.document.close()
}
