import{j as i}from"./query-AElufN0_.js";import{r as g}from"./monitoring-Da2eeJZp.js";import{B as l}from"./Button-BJHSndbn.js";import"./ui.store-Dc2gb5an.js";import{w as x}from"./index-Bp3W46Rh.js";import{ad as h}from"./useHr-BBnByndm.js";const e=t=>String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),o=t=>t==null||t===""||Number.isNaN(Number(t))?"—":new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(Number(t)),d=t=>t==null||t===""?"—":Number(t).toLocaleString("en-US",{maximumFractionDigits:2}),c=()=>(typeof import.meta<"u"?import.meta:{}).env?.BASE_URL??"/",p={company:"report-assets/logo-company.png",baghdad:"report-assets/logo-baghdad.png"},S={resignation_accept:"قبول استقالة",termination:"إنهاء خدمات",dismissal:"فصل من الخدمة",contract_end:"انتهاء عقد",retirement:"إحالة إلى التقاعد",death:"إنهاء خدمة (وفاة)",settlement:"تصفية نهاية الخدمة",thanks:"شكر وتقدير",notice:"تنبيه",warning:"إنذار"},m=new Set(["thanks","notice","warning"]);function u(t){const a=Array.isArray(t.advances)?t.advances:[],s=Number(t.net??0);return`
    <div class="sect">بنود التصفية النهائية</div>
    <table class="items">
      <thead><tr><th class="c-num">ت</th><th>البند</th><th>التفصيل</th><th class="c-amt">المبلغ (د.ع)</th></tr></thead>
      <tbody>
        <tr><td class="c-num">1</td><td>راتب شهر الإنهاء حتى آخر يوم عمل</td><td>${t.salary_source==="paid_in_sheet"?"صُرف ضمن كشف الشهر المعتمد":`${d(t.salary_days)} يوم مستحق × ${o(t.day_rate)}`}</td><td class="num">${o(t.salary_net)}</td></tr>
        <tr><td class="c-num">2</td><td>تعويض رصيد الإجازات المتبقي</td><td>${d(t.leave_days)} يوم × ${o(t.day_rate)}</td><td class="num">${o(t.leave_amount)}</td></tr>
        <tr><td class="c-num">3</td><td>السلف غير المسددة (تُستقطع)</td><td>${a.length===0?"لا سلف مفتوحة":a.map(n=>`${e(n.ref_no)}: متبقٍ ${o(n.remaining)}`).join(" · ")}</td><td class="num neg">− ${o(t.advances_total)}</td></tr>
      </tbody>
      <tfoot><tr><th colspan="3">${s<0?"ذمة على الموظف":"صافي التصفية المستحق للموظف"}</th><th class="num ${s<0?"neg":"pos"}">${o(Math.abs(s))}</th></tr></tfoot>
    </table>`}function v(t){const a=t.payload??{},s=Array.isArray(t.body)?t.body:[],n=t.issued_date??(t.issued_at??"").slice(0,10);return`
  <div class="doc doc-${e(t.kind)}" dir="rtl">
    <div class="masthead">
      <img class="logo" src="${c()}${p.company}" alt="شعار شركة جزيرة الأكارم" />
      <div class="org">
        <div class="bismillah">بسم الله الرحمن الرحيم</div>
        <div class="name">شركة جزيرة الأكارم</div>
        <div class="sub">الإدارة العامة — مكتب المدير المفوض</div>
      </div>
      <img class="logo" src="${c()}${p.baghdad}" alt="شعار أمانة بغداد" />
    </div>
    <div class="refrow">
      <div class="refbox"><span class="k">العدد:</span> <span class="v">${e(t.ref)}</span></div>
      <div class="docbadge">${e(t.kind_label)}</div>
      <div class="refbox"><span class="k">التاريخ:</span> <span class="v">${e(n)}</span></div>
    </div>
    <p class="to">إلى / ${e(t.full_name)}${t.job_title?` — ${e(t.job_title)}`:""}${t.department_name?` / ${e(t.department_name)}`:""}</p>
    <p class="subject">م / ${e(t.subject)}</p>
    <div class="body">
      <p class="greet">تحية طيبة…</p>
      ${s.map(r=>`<p>${e(r)}</p>`).join("")}
    </div>
    <table class="meta">
      <tr><th>اسم الموظف</th><td>${e(t.full_name)}</td><th>الرقم الوظيفي</th><td class="num">${e(t.employee_number??"—")}</td></tr>
      <tr><th>القسم</th><td>${e(t.department_name??"—")}</td><th>العنوان الوظيفي</th><td>${e(t.job_title??"—")}</td></tr>
      ${m.has(t.kind)?`<tr><th>تاريخ التعيين</th><td class="num">${e(t.hire_date??"—")}</td><th>${t.kind==="thanks"?"رقم المكافأة":"التسلسل في السجل"}</th><td class="num">${t.kind==="thanks"?e(a.reward_ref??"—"):String(Number(a.prior_count??0)+1)}</td></tr>`:`<tr><th>تاريخ التعيين</th><td class="num">${e(t.hire_date??"—")}</td><th>آخر يوم عمل</th><td class="num">${e(a.last_day??"—")}</td></tr>`}
      ${a.service_years!=null?`<tr><th>مدة الخدمة</th><td class="num">${d(a.service_years)} سنة</td><th>نوع الإنهاء</th><td>${e(a.termination_label??"—")}</td></tr>`:""}
    </table>
    ${t.kind==="settlement"?u(a):""}
    <p class="closing">… مع التقدير</p>
    <div class="sign">
      <div class="sign-block">
        <div class="sign-name">${e(t.signer_name??t.signer_title)}</div>
        <div class="sign-title">${e(t.signer_title)}</div>
        <div class="sign-date">${e(n)}</div>
      </div>
    </div>
    <div class="cc">نسخة منه إلى: ${m.has(t.kind)?"":"الشؤون المالية · "}الموارد البشرية${a.manager_name?` · المدير المباشر (${e(a.manager_name)})`:""} · الإضبارة الشخصية</div>
    <p class="foot">كتاب رسمي صادر آلياً من نظام شركة جزيرة الأكارم — رقم ${e(t.ref)} — لا يُعدَّل بعد صدوره</p>
  </div>`}const w=`
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
`;function f(t,a={}){return`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" /><title>كتاب ${e(t.ref)} — ${e(t.kind_label)}</title><style>${w}</style></head><body>
  ${v(t)}
  ${a.autoPrint?'<div class="noprint"><button onclick="window.print()" style="padding:10px 26px;font-size:15px;cursor:pointer;border:none;border-radius:8px;background:#0b3d6b;color:#fff">طباعة / حفظ PDF</button></div><script>window.onload=function(){setTimeout(function(){window.print();},400);}<\/script>':""}
  </body></html>`}function y(t){const a=window.open("","_blank","width=900,height=1000");if(!a)throw new Error("تعذّر فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة");a.document.write(f(t,{autoPrint:!0})),a.document.close()}function L({id:t,onClose:a}){const n=h(t).data,r=g.useMemo(()=>n?f(n):"",[n]);return i.jsx("div",{className:"fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4",onClick:a,"data-testid":"letter-viewer",children:i.jsxs("div",{className:"flex h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl",onClick:b=>b.stopPropagation(),dir:"rtl",children:[i.jsxs("div",{className:"flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2",children:[n&&i.jsxs(i.Fragment,{children:[i.jsx("span",{className:"rounded-full bg-[#0b3d6b] px-3 py-1 text-xs font-bold text-white","data-testid":"letter-kind",children:n.kind_label}),i.jsxs("span",{className:"text-sm font-black text-slate-800","data-testid":"letter-ref",children:["العدد ",n.ref]}),i.jsxs("span",{className:"text-xs text-slate-600",children:[n.full_name," · ",n.issued_date??n.issued_at.slice(0,10)]})]}),i.jsxs("div",{className:"ms-auto flex gap-2",children:[n&&i.jsx(l,{size:"sm",variant:"primary",onClick:()=>y(n),"data-testid":"letter-print",children:"طباعة / حفظ PDF"}),i.jsx(l,{size:"sm",variant:"ghost",onClick:a,"data-testid":"letter-close",children:"إغلاق"})]})]}),n?i.jsx("iframe",{title:`كتاب ${n.ref}`,srcDoc:r,className:"h-full w-full flex-1 bg-[#eef2f6]","data-testid":"letter-frame"}):i.jsx(x,{})]})})}export{L,S as a};
//# sourceMappingURL=LetterViewer-Ciwqy43G.js.map
