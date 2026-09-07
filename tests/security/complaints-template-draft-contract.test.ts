import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/00067_complaint_templates_and_drafts_hardening.sql', 'utf8')
const sdk = readFileSync('src/services/complaints.sdk.ts', 'utf8')
const page = readFileSync('src/portals/complaints/pages/Templates/TemplatesPage.tsx', 'utf8')

function functionBody(name: string): string {
  const start = migration.indexOf(`function public.${name}`)
  expect(start).toBeGreaterThan(-1)
  const next = migration.indexOf('create or replace function', start + 30)
  return migration.slice(start, next === -1 ? migration.length : next)
}

describe('عقد القوالب والمسودات الآمن', () => {
  it('يحفظ القالب عبر RPC ذري ويمنع تعدد الافتراضي في النطاق نفسه', () => {
    expect(sdk).toContain("supabase.rpc('complaint_save_template'")
    expect(migration).toContain('complaint_templates_one_default_per_scope')
    expect(migration).toContain("sector is not distinct from p_sector")
    expect(migration).toContain('COMPLAINT_TEMPLATE_DEFAULT_INACTIVE')
  })

  it('يتحقق من نشاط القالب وتوافقه مع القاطع في تقريري البريد واليوم', () => {
    for (const name of ['complaint_prepare_daily_report', 'complaint_prepare_email_report']) {
      const body = functionBody(name)
      expect(body).toContain('COMPLAINT_TEMPLATE_INACTIVE')
      expect(body).toContain('COMPLAINT_TEMPLATE_SECTOR_MISMATCH')
      expect(body).toContain('is_active')
    }
  })

  it('يعيد التقرير الموجود قبل أي upsert كي لا يمسح تصميم المسودة', () => {
    const daily = functionBody('complaint_prepare_daily_report')
    const email = functionBody('complaint_prepare_email_report')
    expect(daily.indexOf('if found then return v_report')).toBeLessThan(daily.indexOf('insert into public.complaint_reports'))
    expect(email.indexOf('if found then return v_report')).toBeLessThan(email.indexOf('insert into public.complaint_reports'))
    expect(page).toContain('لن نعيد إنشاءه أو نمسح تصميمه')
  })
})
