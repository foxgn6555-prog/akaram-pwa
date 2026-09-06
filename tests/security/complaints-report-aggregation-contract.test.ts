import{readFileSync}from'node:fs';import{describe,expect,it}from'vitest'
const sql=readFileSync('supabase/migrations/00056_complaints_daily_report_aggregation_guard.sql','utf8')
const base=readFileSync('supabase/migrations/00049_complaints_reports_settings.sql','utf8')
describe('عقد تجميع التقرير اليومي',()=>{
 it('يحافظ على تقرير واحد لكل يوم وقاطع',()=>{expect(base).toMatch(/unique\s*\(report_date,\s*sector\)/)})
 it('لا يدرج إلا التذاكر التي اعتمدها موظف الشكاوى',()=>{expect(sql).toContain("i.status='approved'");expect(sql).toContain('COMPLAINT_REPORT_NO_APPROVED_ITEMS')})
 it('إعادة التحضير تضم الاعتمادات المتأخرة إلى التقرير نفسه',()=>{expect(sql).toContain('on conflict(report_date,sector)do update');expect(sql).toContain('on conflict(report_id,item_id)do update')})
 it('يلغي إدراج أي عنصر لم يعد مؤهلاً دون حذفه فعلياً',()=>{expect(sql).toContain('set included=false');expect(sql).not.toMatch(/delete from public\.complaint_report_items/)})
})
