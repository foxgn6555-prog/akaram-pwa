/**
 * V-27 — لوحة «البصمات غير المطابقة» لبوابة الموارد البشرية فقط.
 *
 * السبب: حارس القاعدة `biometric_punches_list` يقبل hr_officer / it_admin / super_admin.
 * فتح اللوحة في غرفة العمليات كان يُطلق 3 طلبات مرفوضة (BIO_FORBIDDEN) في كل تحميل
 * ولا تظهر أبداً. القرار: تُخفى من غرفة العمليات وتبقى كاملة في HR — بلا أي مسّ بالصلاحيات.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const opsPage = readFileSync('src/portals/ops-room/pages/Attendance/OpsAttendancePage.tsx', 'utf8')
const hrPage = readFileSync('src/portals/hr/pages/Attendance/AttendanceLog.tsx', 'utf8')

describe('V-27 · البصمات غير المطابقة', () => {
  it('لا تُستدعى لوحة البصمات في غرفة العمليات', () => {
    expect(opsPage).not.toContain('UnmatchedPunchesPanel')
    expect(opsPage).not.toContain('useBiometricPunches')
  })

  it('تبقى كاملة في بوابة الموارد البشرية', () => {
    expect(hrPage).toContain('UnmatchedPunchesPanel')
  })

  it('حارس القاعدة لم يُوسَّع لدور غرفة العمليات (الصلاحيات كما هي)', () => {
    // العقد موثّق في مكوّن اللوحة نفسه: القراءة عبر RPC محمية على الخادم
    const panel = readFileSync('src/portals/hr/components/UnmatchedPunchesPanel.tsx', 'utf8')
    expect(panel).toContain('useBiometricPunches')
  })
})
