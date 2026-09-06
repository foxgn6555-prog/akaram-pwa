import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const edge = readFileSync('supabase/functions/complaint-permanent-delete/index.ts', 'utf8')
const migration = readFileSync('supabase/migrations/00066_complaint_deletion_retry_and_claim.sql', 'utf8')

describe('عقد الحذف النهائي القابل للاسترداد', () => {
  it('يحجز الطلب ذرياً قبل حذف أي كائن من Storage', () => {
    const claim = edge.indexOf("admin.rpc('complaint_claim_permanent_deletion'")
    const remove = edge.indexOf("storage.from('complaint-media').remove")
    expect(claim).toBeGreaterThan(-1)
    expect(remove).toBeGreaterThan(claim)
  })

  it('ينقل فشل التنفيذ من executing إلى failed فقط', () => {
    expect(edge).toContain(".eq('status','executing')")
    expect(migration).toContain("status='executing'")
    expect(migration).toContain("status='failed'")
  })

  it('يقصر الحجز والإنهاء على service_role وإعادة المحاولة على مدير النظام', () => {
    expect(migration).toContain("COMPLAINT_DELETE_CLAIM_SERVICE_ROLE_ONLY")
    expect(migration).toContain("COMPLAINT_FINALIZE_SERVICE_ROLE_ONLY")
    expect(migration).toContain("app.has_role(array['super_admin'])")
  })

  it('يمنع تنفيذ طلب واحد بالتوازي ويتيح استرداد التنفيذ العالق', () => {
    expect(migration).toContain("where r.id=p_request_id and r.folder_id=f.id and r.status='approved'")
    expect(migration).toContain("execution_started_at<now()-interval '10 minutes'")
    expect(migration).toContain("attempt_count=attempt_count+1")
  })
})
