import{readFileSync}from'node:fs';import{describe,expect,it}from'vitest'
const sql=readFileSync('supabase/migrations/00058_complaints_after_media_ordering.sql','utf8')
const report=readFileSync('supabase/functions/complaint-generate-report/index.ts','utf8')
describe('عقد صور المعالجة المتعددة المرتبة',()=>{
 it('يقصر التسجيل على المسؤول المسند إليه والتذكرة الجارية',()=>{expect(sql).toContain('assigned_to=auth.uid()');expect(sql).toContain("v_item.status<>'in_progress'")})
 it('يفرض 1–20 صورة و100MB إجمالاً و25MB للصورة',()=>{expect(sql).toContain('v_count>20');expect(sql).toContain('v_total>104857600');expect(sql).toContain('>26214400');expect(sql).toContain("^[0-9a-f]{64}$");expect(sql).toContain('not between -90 and 90')})
 it('يفرض ترتيباً فريداً متصلاً ويعطل النسخة السابقة دون حذفها',()=>{expect(sql).toContain('v_order_count<>jsonb_array_length(p_files)');expect(sql).toContain('v_min_order<>1');expect(sql).toContain('set is_active=false');expect(sql).not.toMatch(/delete from public\.complaint_media/)})
 it('ينشئ التقرير شريحة لكل صورة بعد حسب display_order',()=>{expect(report).toContain(".order('display_order')");expect(report).toContain("media_kind==='after'");expect(report).toContain('for(let afterIndex=0;afterIndex<pages.length;afterIndex+=1)')})
 it('يفشل بوضوح عند نقص بيانات التقرير أو خطأ أي استعلام ولا يعلن نجاحاً زائفاً',()=>{expect(report).toContain('if(linksError)throw linksError');expect(report).toContain('REPORT_ITEMS_INCOMPLETE');expect(report).toContain('if(mediaResult.error)throw mediaResult.error');expect(report).toContain("update({status:'failed'})")})
 it('يضيف مؤشرات ورسماً تنفيذياً ويدعم WebP في ملف PowerPoint',()=>{expect(report).toContain('المؤشرات التنفيذية للتقرير');expect(report).toContain('توزيع المواقع حسب المركز البلدي');expect(report).toContain('ContentType="image/webp"');expect(report).toContain("mime==='image/webp'?'webp'")})
})
