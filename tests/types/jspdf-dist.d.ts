/**
 * تعريف أنواع محيطي لمسار بناء المتصفح في jspdf.
 *
 * jspdf 4.x لا يزوّد تعريف أنواع (types) للمسْرَد الفرعي `dist/jspdf.es.min.js`
 * الذي تُستورده اختبارات عقد تصدير PDF عمداً (لأنه المسار الذي يَحْزِمُه Vite
 * فعلاً في البناء). يُعلَن هنا كنوع محيطي حتى يمر فحص الأنواع `tsc -b`
 * دون التخلي عن العقد الذي يحميه الاختبار.
 */
declare module 'jspdf/dist/jspdf.es.min.js' {
  export class jsPDF {
    constructor(options?: Record<string, unknown>)
    addImage(...args: unknown[]): this
    output(type: 'blob'): Blob
    output(type: 'arraybuffer'): ArrayBuffer
  }
}
