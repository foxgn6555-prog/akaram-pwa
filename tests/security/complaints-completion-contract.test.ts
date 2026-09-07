import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const workflow = readFileSync('supabase/migrations/00047_complaints_workflow.sql', 'utf8')
const reports = readFileSync('supabase/migrations/00049_complaints_reports_settings.sql', 'utf8')
const generator = readFileSync('supabase/functions/complaint-generate-report/index.ts', 'utf8')
const mail = readFileSync('supabase/functions/mailgun-send/index.ts', 'utf8')
const manager = readFileSync('src/portals/manager/pages/Complaints/ComplaintTicketPage.tsx', 'utf8')
const tickets = readFileSync('supabase/migrations/00059_complaint_assignment_tickets.sql','utf8')
const reviewSafety = readFileSync('supabase/migrations/00071_complaint_review_requires_after_media.sql','utf8')

describe('عقد دورة الشكوى المكتملة', () => {
  it('يعزل المسؤول حسب الإسناد ويفرض صورة بعد أحدث من بدء المعالجة', () => {
    expect(workflow).toContain("assigned_to=auth.uid()")
    expect(workflow).toContain("media_kind='after' and captured_at >=")
    expect(workflow).toContain("v_old not in ('assigned','returned')")
    expect(manager).toContain('useComplaintItemsMedia')
    expect(manager).toContain('useCompleteComplaintAssignmentTicket')
    expect(tickets).toContain('complaint_complete_assignment_ticket')
    expect(manager).toContain('useManagerComplaintTicket')
  })

  it('التدقيق للموظف فقط والإرجاع يحتاج سبباً', () => {
    expect(reviewSafety).toContain("app.has_role(array['complaints_officer','super_admin'])")
    expect(reviewSafety).toContain('COMPLAINT_RETURN_NOTE_REQUIRED')
    expect(reviewSafety).toMatch(/v_next:=case when p_approved then'approved'else'returned'end/)
  })

  it('يمنع الخادم اعتماد الموقع أو التذكرة دون صورة معالجة فعالة',()=>{
    expect(reviewSafety).toContain("media_kind='after' and is_active")
    expect(reviewSafety.match(/COMPLAINT_AFTER_MEDIA_REQUIRED/g)?.length).toBeGreaterThanOrEqual(2)
    expect(reviewSafety).toContain('complaint_review_assignment_ticket')
    expect(reviewSafety).toContain('complaint_review_item')
  })

  it('التقرير يشمل كل عناصر يوم بغداد مع حالتها ولا يستبعد غير المعالج', () => {
    expect(reports).toContain("timezone('Asia/Baghdad',c.received_at)::date=p_date")
    expect(reports).toContain('from public.complaint_items i join public.complaints c')
    expect(reports).not.toMatch(/where[^;]+i\.status\s+in/is)
  })

  it('مولد PowerPoint محمي ويتحقق من صور JPEG/PNG قبل تحليلها', () => {
    expect(generator).toContain("['complaints_officer','super_admin']")
    expect(generator).toContain("['image/jpeg','image/png','image/webp'].includes(mime)")
    expect(generator).toContain('validMagic(bytes,mime)')
    expect(generator).toContain("status:'quality_review'")
    expect(generator).toContain("JSZip from 'npm:jszip@3.10.1'")
    expect(generator).not.toContain('pptxgenjs')
  })

  it('إرسال التقرير مرتبط بتقرير معتمد وسجل التسليم', () => {
    expect(mail).toContain(".in('status', ['approved', 'failed'])")
    expect(mail).toContain('REPORT_NOT_APPROVED')
    expect(mail).toContain('report_id: reportId')
  })

  it('الأرشفة لا تحدث إلا بعد delivered ولا يوجد حذف فعلي', () => {
    expect(reports).toContain("new.status='delivered'")
    expect(reports).toMatch(/status='archived',[^;]+archived_at=now\(\)/)
    expect(reports).not.toMatch(/create policy[^;]+for delete/is)
  })
})
