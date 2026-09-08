import { buildExcelReport } from '@lib/export/excel-report'
import type { GarageReportResult } from './reports'

const fuelLabels:Record<string,string>={gas_oil:'الكاز',hydraulic:'الهيدروليك',grease:'الدهن',c_oil:'C-Oil'}
const movementLabels:Record<string,string>={stock_in:'إضافة مخزون',vehicle_fill:'تعبئة آلية',approved_reset:'تصفير معتمد'}
const arDate=(value:string)=>new Intl.DateTimeFormat('ar-IQ',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Baghdad'}).format(new Date(value))
export function exportGarageCsv(result:GarageReportResult):void{
  const safe=(value:unknown)=>{let text=String(value??'');if(/^[=+\-@]/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`}
  const headers=['نوع الحركة','المادة','الخزان','الآلية','DB','المنطقة','الكمية','الرصيد قبل','الرصيد بعد','الموعد التالي','وقت العملية','منفذ العملية','ملاحظات']
  const lines=[headers,...result.rows.map(row=>[movementLabels[row.movementType],fuelLabels[row.fuelType],row.tankName,row.vehicleName??'',row.dbNumber??'',row.areaName??'',Math.abs(row.quantity),row.quantityBefore,row.quantityAfter,row.nextRefillDate??'',arDate(row.createdAt),row.actorName,row.notes??''])].map(row=>row.map(safe).join(','))
  if(typeof document==='undefined'||typeof URL?.createObjectURL!=='function')return
  const url=URL.createObjectURL(new Blob([`\ufeff${lines.join('\n')}`],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`تقرير-الكراج-${result.from}-${result.to}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000)
}
export async function exportGarageReport(result:GarageReportResult):Promise<void>{
  await buildExcelReport({sheetName:'حركات المخزون',companySub:'بوابة الكراج المركزي',title:'تقرير الوقود والمخزون',meta:`الفترة: ${result.from} إلى ${result.to} · عدد الحركات: ${result.totalCount}`,fileName:`تقرير-الكراج-${result.from}-${result.to}.xlsx`,orientation:'landscape',columns:[
    {header:'#',key:'#',width:7},{header:'نوع الحركة',key:'movement',width:18},{header:'المادة',key:'fuel',width:14},{header:'الخزان',key:'tank',width:20},{header:'الآلية',key:'vehicle',width:22},{header:'DB',key:'db',width:14},{header:'القاطع والمنطقة',key:'area',width:22},{header:'الكمية',key:'quantity',width:13,numFmt:'0.000'},{header:'الرصيد قبل',key:'before',width:14,numFmt:'0.000'},{header:'الرصيد بعد',key:'after',width:14,numFmt:'0.000'},{header:'الموعد التالي',key:'next',width:16},{header:'وقت العملية',key:'created',width:22},{header:'منفذ العملية',key:'actor',width:38},{header:'ملاحظات',key:'notes',width:30,wrap:true},
  ],rows:result.rows.map(row=>({movement:movementLabels[row.movementType],fuel:fuelLabels[row.fuelType],tank:row.tankName,vehicle:row.vehicleName??'—',db:row.dbNumber??'—',area:row.areaName?`${row.parentSector==='karrada'?'الكرادة':'الزعفرانية'} · ${row.areaName}`:'—',quantity:Math.abs(row.quantity),before:row.quantityBefore,after:row.quantityAfter,next:row.nextRefillDate??'—',created:arDate(row.createdAt),actor:row.actorName,notes:row.notes??''})),totalRow:{movement:'الإجماليات',quantity:result.consumptionTotal,before:`إضافة: ${result.stockInTotal}`,after:`تصفير: ${result.resetTotal}`},charts:[{title:'الاستهلاك حسب المادة',kind:'bar',valueLabel:'وحدة',data:result.byType.map(item=>({label:fuelLabels[item.fuelType]??item.fuelType,value:item.quantity}))},{title:'الاستهلاك حسب الخزان',kind:'bar',valueLabel:'وحدة',data:result.byTank.map(item=>({label:item.tankName,value:item.consumption}))}]})
}
