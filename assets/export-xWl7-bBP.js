import{q as b}from"./index-Bp3W46Rh.js";import{buildExcelReport as w}from"./excel-report-Bc_knGCL.js";const g=b;function c(t){return typeof t.net_weight=="number"?t.net_weight:typeof t.gross_weight=="number"&&typeof t.tare_weight=="number"?+(t.gross_weight-t.tare_weight).toFixed(2):null}function h(t,o){return`سجل الأوزان ${g[o]??o} - ${t}`}function d(t){return(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function x(){return`${(typeof import.meta<"u"?import.meta:{}).env?.BASE_URL??"/"}icons/logo.png`}const y=[{header:"ت",key:"#",width:5,align:"center"},{header:"DB",key:"db_number",width:14,align:"center"},{header:"اسم السائق",key:"driver_name",width:26,align:"right"},{header:"صنف الآلية",key:"vehicle_type",width:17},{header:"الوزن الكلي (طن)",key:"gross_weight",width:16,align:"center",numFmt:"0.00"},{header:"الوزن الفارغ (طن)",key:"tare_weight",width:16,align:"center",numFmt:"0.00"},{header:"الوزن الصافي (طن)",key:"net_weight",width:17,align:"center",numFmt:"0.00"},{header:"وقت الدخول",key:"entry_time",width:12,align:"center"}];async function k(t,o,a){const r=new Date().toISOString().slice(0,10),s=t.map(e=>({db_number:e.db_number,driver_name:e.driver_name,vehicle_type:e.vehicle_type??"",gross_weight:e.gross_weight??"",tare_weight:e.tare_weight??"",net_weight:c(e)??"",entry_time:e.entry_time??""})),l=e=>+t.reduce((u,f)=>u+(e(f)??0),0).toFixed(2),n=l(e=>e.gross_weight),i=l(e=>e.tare_weight),p=l(e=>c(e)),m=t.filter(e=>e.status==="draft").length,_=t.filter(e=>e.status==="submitted_to_ops").length;return w({sheetName:"دفتر الأوزان",company:"شركة جزيرة الأكارم",companySub:"المحطة التحويلية — سجل الأوزان الداخل",title:h(o,a),meta:`تاريخ التصدير: ${r}   •   عدد السجلات: ${t.length}   •   إجمالي الصافي: ${p.toFixed(2)} طن   •   وُلِّد آلياً من نظام بلدية جزيرة الأكارم`,columns:y,rows:s,fileName:`سجل-الأوزان-${g[a]??a}-${o}.xlsx`,orientation:"landscape",totalRow:{driver_name:"الإجمالي (طن)",gross_weight:n,tare_weight:i,net_weight:p},charts:[{title:"ملخص الأوزان (كلي / فارغ / صافي) بالطن",kind:"bar",valueLabel:"طن",data:[{label:"الوزن الكلي",value:n,color:"#005F8D"},{label:"الوزن الفارغ",value:i,color:"#94A3B8"},{label:"الوزن الصافي",value:p,color:"#10B981"}]},{title:"حالة سجلات الدفتر",kind:"donut",valueLabel:"سجل",data:[{label:"مسودة (بانتظار التدقيق)",value:m,color:"#f59e0b"},{label:"مُرسل لغرفة العمليات",value:_,color:"#10b981"}]}]})}function F(t,o,a){const r=window.open("","_blank","width=1000,height=760");if(!r)throw new Error("تعذّر فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة");const s=t.reduce((n,i)=>n+(c(i)??0),0),l=t.map((n,i)=>`
      <tr${i%2===1?' class="alt"':""}>
        <td>${i+1}</td>
        <td class="num">${d(n.db_number)}</td>
        <td>${d(n.driver_name)}</td>
        <td>${d(n.vehicle_type??"")}</td>
        <td class="num">${n.gross_weight??""}</td>
        <td class="num">${n.tare_weight??""}</td>
        <td class="num strong">${c(n)??""}</td>
        <td class="num">${d(n.entry_time??"")}</td>
      </tr>`).join("");r.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${h(o,a)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: 'Segoe UI', 'Cairo', Tahoma, sans-serif; margin: 16px; color: #0f172a; }

  .masthead { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #005f8d; padding-bottom: 10px; }
  .masthead img { width: 46px; height: 46px; object-fit: contain; }
  .org { flex: 1; text-align: center; }
  .org .name { font-size: 19px; font-weight: 800; color: #005f8d; }
  .org .sub { font-size: 12px; color: #64748b; margin-top: 2px; }
  .titlebar { margin: 12px 0 4px; text-align: center; font-size: 17px; font-weight: 800; }
  .meta-row { display: flex; justify-content: space-between; font-size: 12.5px; color: #334155; margin-bottom: 10px; }

  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #94a3b8; padding: 7px 6px; font-size: 12.5px; text-align: center; }
  thead th { background: #005f8d; color: #fff; font-weight: 700; }
  tbody tr.alt { background: #f1f5f9; }
  .num { direction: ltr; }
  .strong { font-weight: 700; color: #005f8d; }
  tfoot td { font-weight: 700; background: #e2e8f0; }

  .sign { margin-top: 34px; display: flex; justify-content: space-between; font-size: 13px; }
  .sign span { min-width: 220px; }
  .foot { margin-top: 14px; text-align: center; font-size: 10.5px; color: #94a3b8; }
  @media print { body { margin: 0; } .noprint { display: none !important; } }
</style>
</head>
<body>
  <div class="masthead">
    <img src="${x()}" alt="شعار جزيرة الأكارم" />
    <div class="org">
      <div class="name">شركة جزيرة الأكارم</div>
      <div class="sub">المحطة التحويلية — سجل الأوزان الداخل</div>
    </div>
    <div style="width:46px"></div>
  </div>
  <div class="titlebar">سجل الأوزان — الشفت ${g[a]??a}</div>
  <div class="meta-row">
    <span>التاريخ: ${o}</span>
    <span>عدد السجلات: ${t.length}</span>
    <span>الإجمالي: ${s.toFixed(2)} طن</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>ت</th><th>DB</th><th>اسم السائق</th><th>صنف الآلية</th>
        <th>الوزن الكلي (طن)</th><th>الوزن الفارغ (طن)</th><th>الوزن الصافي (طن)</th><th>وقت الدخول</th>
      </tr>
    </thead>
    <tbody>${l||'<tr><td colspan="8">لا توجد سجلات في هذا الدفتر</td></tr>'}</tbody>
    <tfoot>
      <tr><td colspan="6" style="text-align:left">إجمالي الوزن الصافي (طن)</td>
          <td class="num">${s.toFixed(2)}</td><td></td></tr>
    </tfoot>
  </table>
  <div class="sign">
    <span>توقيع مسؤول المحطة: ______________</span>
    <span>التدقيق (غرفة العمليات): ______________</span>
  </div>
  <p class="foot">وُلِّد آلياً من نظام بلدية جزيرة الأكارم — ${new Date().toLocaleString("ar-IQ-u-nu-latn")}</p>
  <p class="noprint" style="margin-top:14px;text-align:center">
    <button onclick="window.print()" style="padding:10px 26px;font-size:15px;cursor:pointer;border:none;border-radius:8px;background:#005f8d;color:#fff">
      طباعة / حفظ كـ PDF
    </button>
  </p>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); }<\/script>
</body>
</html>`),r.document.close()}export{c as n,F as p,h as s,k as t};
//# sourceMappingURL=export-xWl7-bBP.js.map
