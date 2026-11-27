import{S as d}from"./index-B0-vXoqQ.js";function l(){return`${(typeof import.meta<"u"?import.meta:{}).env?.BASE_URL??"/"}icons/logo.png`}function o(t){return(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function c(t,i){return t.map(e=>i?.[e]??`القاطع ${e}`).join("، ")}function s(t,i){const e=c(t.sectors,i);return`
  <div class="doc">
    <div class="masthead">
      <img src="${l()}" alt="شعار جزيرة الأكارم" />
      <div class="org">
        <div class="name">شركة جزيرة الأكارم</div>
        <div class="sub">شركة البلدية — نظام مسؤولي القواطع</div>
      </div>
      <div class="docbadge">كتاب رسمي</div>
    </div>

    <div class="refrow">
      <span class="refbox">${o(t.ref_no)}</span>
      <span class="dateline">التاريخ: ${o((t.created_at??"").slice(0,10))}</span>
    </div>

    <p class="to">إلى / معاون المدير المفوض المحترم ………</p>
    <p class="subject"><b>الموضوع:</b> طلب تجهيز مستلزمات قاطع</p>

    <p class="body">
      تحية طيبة وبعد…
      <br />
      نرجو التفضّل بالموافقة على تجهيز المستلزمات الموضّحة أدناه واللازمة لسير عمل
      <b>${o(e)}</b> ضمن <b>${o(d[t.shift]??t.shift)}</b>.
    </p>

    <table class="meta">
      <tr><th>مقدّم الطلب (مسؤول القاطع)</th><td>${o(t.manager_name)}</td></tr>
      <tr><th>القاطع / القواطع</th><td>${o(e)}</td></tr>
      <tr><th>الشفت</th><td>${o(d[t.shift]??t.shift)}</td></tr>
    </table>

    <div class="sect">تفاصيل المستلزمات المطلوبة</div>
    <table class="items">
      <thead>
        <tr><th class="c-num">ت</th><th>نوع المستلزمات</th><th class="c-qty">العدد المطلوب</th></tr>
      </thead>
      <tbody>
        <tr>
          <td class="c-num">1</td>
          <td>${o(t.supply_type)}</td>
          <td class="c-qty num">${t.quantity}</td>
        </tr>
      </tbody>
    </table>
    ${t.notes?`<div class="notes"><b>ملاحظات:</b> ${o(t.notes)}</div>`:""}

    <div class="sign">
      <div class="sign-block">
        <div class="sign-label">مقدّم الطلب والتوقيع الإلكتروني</div>
        <div class="sign-name">${o(t.manager_name)}</div>
        <div class="sign-line">مسؤول ${o(e)}</div>
      </div>
      <div class="sign-block">
        <div class="sign-label">موافقة معاون المدير المفوض</div>
        <div class="sign-line">&nbsp;</div>
        <div class="sign-line">التوقيع والختم</div>
      </div>
    </div>
    <p class="foot">وُلِّد آلياً من نظام بلدية جزيرة الأكارم</p>
  </div>`}function r(t){return`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>كتاب طلب مستلزمات</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI','Cairo',Tahoma,sans-serif; color:#0f172a; margin:0; background:#eef2f6; }
  .doc { max-width:800px; margin:16px auto; background:#fff; border:1px solid #e2e8f0;
         border-radius:12px; padding:28px 32px; box-shadow:0 8px 28px rgba(15,23,42,.10); }
  .masthead { display:flex; align-items:center; gap:14px; border-bottom:3px solid #005f8d; padding-bottom:14px; }
  .masthead img { width:60px; height:60px; object-fit:contain; }
  .org { flex:1; text-align:center; }
  .org .name { font-size:21px; font-weight:800; color:#005f8d; }
  .org .sub { font-size:12px; color:#64748b; margin-top:2px; }
  .docbadge { font-size:15px; font-weight:800; color:#005f8d; border:2px solid #005f8d;
              border-radius:10px; padding:6px 16px; white-space:nowrap; }
  .refrow { display:flex; justify-content:space-between; align-items:center; margin:12px 0 8px; }
  .refbox { background:#e9f6ee; border:1.5px solid #2f855a; color:#1e6b4a; font-weight:800;
            border-radius:8px; padding:5px 16px; font-size:13px; }
  .dateline { font-size:13px; font-weight:600; color:#334155; }
  .to { font-size:14px; margin:14px 0 4px; }
  .subject { font-size:14px; margin:0 0 10px; }
  .body { font-size:14px; line-height:2.1; margin:8px 0 14px; }
  table.meta, table.items { width:100%; border-collapse:collapse; margin:8px 0 12px; }
  table.meta th, table.meta td { border:1.2px solid #cbd5e1; padding:9px 12px; font-size:14px; }
  table.meta th { background:#eef6fc; color:#005f8d; text-align:right; width:34%; font-weight:700; }
  table.meta td { font-weight:600; }
  .sect { display:inline-block; background:#005f8d; color:#fff; border-radius:8px; padding:5px 18px;
          font-size:13px; font-weight:700; margin:6px 0 8px; }
  table.items th, table.items td { border:1.2px solid #94a3b8; padding:10px 12px; font-size:14px; text-align:center; }
  table.items thead th { background:#005f8d; color:#fff; }
  table.items td:nth-child(2) { text-align:right; font-weight:600; }
  .c-num { width:60px; } .c-qty { width:130px; }
  .num { direction:ltr; font-weight:800; color:#005f8d; font-size:16px; }
  .notes { background:#f8fafc; border:1px dashed #94a3b8; border-radius:10px; padding:10px 14px;
           font-size:13px; line-height:1.9; margin:8px 0; }
  .sign { display:flex; justify-content:space-between; gap:24px; margin-top:44px; }
  .sign-block { flex:1; text-align:center; }
  .sign-label { font-size:12px; color:#64748b; margin-bottom:26px; }
  .sign-name { font-weight:800; font-size:15px; }
  .sign-line { border-bottom:1.5px solid #334155; height:26px; font-size:12px; color:#64748b; }
  .foot { margin-top:24px; text-align:center; font-size:10.5px; color:#94a3b8; }
  .noprint { text-align:center; margin-top:16px; }
  @media print {
    body { background:#fff; } .doc { box-shadow:none; border:none; border-radius:0; margin:0; padding:0; }
    .noprint { display:none; }
  }
</style>
</head>
<body>
  ${t}
  <div class="noprint">
    <button onclick="window.print()"
      style="padding:10px 26px;font-size:15px;cursor:pointer;border:none;border-radius:8px;background:#005f8d;color:#fff">
      طباعة / حفظ PDF
    </button>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print();},300);}<\/script>
</body>
</html>`}function f(t,i){const e=r(s(t,i)),p=new Blob(["\uFEFF",e],{type:"application/msword;charset=utf-8"}),a=URL.createObjectURL(p),n=document.createElement("a");n.href=a,n.download=`كتاب-مستلزمات-${t.ref_no??t.id}.doc`,document.body.appendChild(n),n.click(),document.body.removeChild(n),setTimeout(()=>URL.revokeObjectURL(a),4e3)}function g(t,i){const e=window.open("","_blank","width=850,height=900");if(!e)throw new Error("تعذّر فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة");e.document.write(r(s(t,i))),e.document.close()}export{g as p,f as t};
//# sourceMappingURL=supply-book-j4v6UXo6.js.map
