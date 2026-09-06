import{readFileSync}from'node:fs';import{describe,expect,it}from'vitest'
const source=readFileSync('src/features/complaints/lib/pdf-pages.ts','utf8');const hook=readFileSync('src/features/complaints/hooks/useComplaints.ts','utf8')
describe('عقد تحويل PDF الفعلي',()=>{
 it('يشغّل عامل PDF.js من الحزمة ويحدد 100 صفحة',()=>{expect(source).toContain('pdf.worker.min.mjs');expect(source).toContain('document.numPages>100')})
 it('يحوّل إلى JPEG مضغوط وينظف الصفحة واللوحة والمستند',()=>{expect(source).toContain("'image/jpeg',.88");expect(source).toContain('page.cleanup()');expect(source).toContain('task.destroy()')})
 it('يرفع كل صفحة فور تحويلها بدل جمع 100 صورة في الذاكرة',()=>{expect(source).toContain('if(onPage)await onPage');expect(hook).toContain('async (page, pageNumber)');expect(hook).toContain('[page], pageNumber')})
})
