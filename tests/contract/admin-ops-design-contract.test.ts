/** 00227: عقد تصميم بوابة مسؤول القاطع — كل وحداتها تستخدم الرأس الموحد (كحلي/ذهبي) بلا رؤوس قديمة. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(process.cwd(), 'src/portals/admin-ops/pages')
const UNIT_PAGES = ['Dashboard/SectorManagerDashboard', 'Requests/TeamRequestsPage', 'Reports/SectorReportsPage', 'Notify/NotifyPage', 'Procedures/ProceduresPage', 'Contractors/ContractorsFollowUpPage']
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))

describe('عقد تصميم بوابة مسؤول القاطع (00227)', () => {
  it('كل وحدة تستخدم ExecPageHeader', () => {
    for (const name of UNIT_PAGES) expect(readFileSync(join(dir, `${name}.tsx`), 'utf8'), name).toMatch(/<ExecPageHeader\b/)
  })
  it('الكشوفات تمر عبر الصفحة المشتركة ذات الرأس الموحد', () => {
    expect(readFileSync(join(dir, 'Disclosures/SectorDisclosuresPage.tsx'), 'utf8')).toMatch(/DisclosuresUnitPage/)
  })
  it('لا رؤوس h1 عادية ولا ألوان indigo قديمة في صفحات البوابة', () => {
    for (const f of walk(dir).filter((x) => x.endsWith('.tsx'))) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/<header>\s*<h1/)
      expect(src, f).not.toMatch(/indigo-/)
    }
  })
})
