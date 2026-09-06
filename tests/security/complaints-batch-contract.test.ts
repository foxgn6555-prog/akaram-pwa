import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql=readFileSync('supabase/migrations/00053_complaints_batch_automation.sql','utf8')
const inbox=readFileSync('src/portals/complaints/pages/Inbox/InboxPage.tsx','utf8')
const assignment=readFileSync('src/portals/complaints/pages/Assignment/AssignmentPage.tsx','utf8')
const manager=readFileSync('src/portals/manager/pages/Complaints/AssignedComplaintsPage.tsx','utf8')

describe('عقد أتمتة دفعات الشكاوى',()=>{
 it('يعطي كل وسيط كوداً دائماً فريداً',()=>{
  expect(sql).toContain('media_code text')
  expect(sql).toContain('unique index uq_complaint_media_code')
  expect(sql).toContain('trg_complaint_media_code')
 })
 it('ينشئ تذكرة واحدة لكل إدخال داخل RPC ذرية',()=>{
  expect(sql).toContain('complaint_batch_create_items_from_inbox')
  expect(sql).toContain('for v_entry in select * from jsonb_array_elements(p_entries)')
  expect(sql).toContain('COMPLAINT_BATCH_DUPLICATE_MEDIA')
  expect(sql).toContain("m.item_id is null and m.mime_type like 'image/%'")
 })
 it('لا يعلن اكتمال البريد مع بقاء صور غير مفروزة',()=>{
  expect(sql).toContain("case when v_remaining=0 then 'imported' else 'ready' end")
 })
 it('يفرض الإسناد الجماعي على حالات قابلة للإسناد فقط',()=>{
  expect(sql).toContain('complaint_assign_items')
  expect(sql).toContain("v_item.status not in ('under_review','returned')")
  expect(sql).toContain('COMPLAINT_ASSIGN_STATE_INVALID')
 })
 it('تستخدم الواجهات hooks الدفعات ولا تصل إلى Supabase مباشرة',()=>{
  expect(inbox).toContain('useBatchCreateComplaintItems')
  expect(assignment).toContain('useAssignComplaintItems')
  expect(inbox).not.toMatch(/supabase\.(from|rpc)/)
  expect(assignment).not.toMatch(/supabase\.(from|rpc)/)
 })
 it('يدعم مسؤول القسم تنزيل صور عدة تذاكر بملف ZIP يحمل أكواد الصور',()=>{
  expect(manager).toMatch(/import\s+JSZip\s+from\s*['"]jszip['"]/ )
  expect(manager).toContain('useComplaintItemsMedia')
  expect(manager).toContain('value.mediaCode')
  expect(manager).not.toMatch(/supabase\.(from|rpc)/)
 })
})
