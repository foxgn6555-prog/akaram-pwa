import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'
const sql=readFileSync('supabase/migrations/00054_complaints_media_review_audit.sql','utf8')
const detail=readFileSync('src/portals/complaints/pages/Processing/ComplaintDetailPage.tsx','utf8')
describe('عقد تصحيح الصور والموقع أثناء التدقيق',()=>{
 it('لا يحذف الصورة السابقة بل يلغي تفعيلها ويربط البديل',()=>{
  expect(sql).toContain('is_active boolean not null default true')
  expect(sql).toContain('superseded_by uuid references public.complaint_media')
  expect(sql).toContain('update public.complaint_media set is_active=false')
  expect(sql).not.toMatch(/delete from public\.complaint_media/)
 })
 it('يحفظ أثراً مستقلاً لكل استبدال مع سبب وهوية المنفذ',()=>{
  expect(sql).toContain('create table public.complaint_media_revisions')
  expect(sql).toContain('old_media_id')
  expect(sql).toContain('new_media_id')
  expect(sql).toContain('actor_id uuid not null')
  expect(sql).toContain('COMPLAINT_MEDIA_REASON_REQUIRED')
 })
 it('يخفي النسخ الملغاة وصفوف التخزين التابعة لها عن مسؤول القسم',()=>{
  expect(sql).toContain('for select to authenticated using(is_active and exists')
  expect(sql).toContain('complaint storage: manager read active assigned')
  expect(sql).toContain('m.storage_path=storage.objects.name and m.is_active')
 })
 it('تصحيح الموقع يحتاج سبباً ويضيف حدثاً تدقيقياً',()=>{
  expect(sql).toContain('complaint_update_item_during_review')
  expect(sql).toContain('COMPLAINT_REVIEW_REASON_REQUIRED')
  expect(sql).toContain('تصحيح بيانات الموقع: ')
 })
 it('تعرض صفحة التدقيق النسخ السابقة ولا تتصل مباشرة بقاعدة البيانات',()=>{
  expect(detail).toContain('النسخ السابقة')
  expect(detail).toContain('useReplaceComplaintItemMedia')
  expect(detail).not.toMatch(/supabase\.(from|rpc)/)
 })
})
