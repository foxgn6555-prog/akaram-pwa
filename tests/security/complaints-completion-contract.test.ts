import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const workflow = readFileSync('supabase/migrations/00047_complaints_workflow.sql', 'utf8')
const reports = readFileSync('supabase/migrations/00049_complaints_reports_settings.sql', 'utf8')
const generator = readFileSync('supabase/functions/complaint-generate-report/index.ts', 'utf8')
const mail = readFileSync('supabase/functions/mailgun-send/index.ts', 'utf8')
const manager = readFileSync('src/portals/manager/pages/Complaints/AssignedComplaintsPage.tsx', 'utf8')

describe('عقد دورة الشكوى المكتملة', () => {
  it('يعزل المسؤول حسب الإسناد ويفرض صورة بعد أحدث من بدء المعالجة', () => {
    expect(workflow).toContain("assigned_to=auth.uid()")
    expect(workflow).toContain("media_kind='after' and captured_at >=")
    expect(workflow).toContain("v_old not in ('assigned','returned')")
    expect(manager).toContain('useComplaintItemMedia(item.id)')
    expect(manager).toContain('أؤكد أن صورة «بعد» تخص الموقع')
  })

  it('التدقيق للموظف فقط والإرجاع يحتاج سبباً', () => {
    expect(reports).toContain("app.has_role(array['complaints_officer','super_admin'])")
    expect(reports).toContain('COMPLAINT_RETURN_NOTE_REQUIRED')
    expect(reports).toMatch(/v_next\s*:=\s*case when p_approved then 'approved' else 'returned' end/)
  })

  it('التقرير يشمل كل عناصر يوم بغداد مع حالتها ولا يستبعد غير المعالج', () => {
    expect(reports).toContain("timezone('Asia/Baghdad',c.received_at)::date=p_date")
    expect(reports).toContain('from public.complaint_items i join public.complaints c')
    expect(reports).not.toMatch(/where[^;]+i\.status\s+in/is)
  })

  it('مولد PowerPoint محمي ويتحقق من صور JPEG/PNG قبل تحليلها', () => {
    expect(generator).toContain("['complaints_officer','super_admin']")
    expect(generator).toContain("['image/jpeg','image/png'].includes(mime)")
    expect(generator).toContain('validMagic(bytes,mime)')
    expect(generator).toContain("status:'quality_review'")
    expect(generator).toContain("JSZip from 'npm:jszip@3.10.1'")
    expect(generator).not.toContain('pptxgenjs')
  })

  it('إرسال التقرير مرتبط بتقرير معتمد وسجل التسليم', () => {
    expect(mail).toContain(".eq('status', 'approved')")
    expect(mail).toContain('REPORT_NOT_APPROVED')
    expect(mail).toContain('report_id: reportId')
  })

  it('الأرشفة لا تحدث إلا بعد delivered ولا يوجد حذف فعلي', () => {
    expect(reports).toContain("new.status='delivered'")
    expect(reports).toMatch(/status='archived',[^;]+archived_at=now\(\)/)
    expect(reports).not.toMatch(/create policy[^;]+for delete/is)
  })
})
