/** 00243: الكشوفات لدى المعاون والمدير المفوض تظهر دائماً بالرأس الموحد — لا شكل قديم ولا خيار hero. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('عقد تصميم كشوفات المعتمدين (00243)', () => {
  const src = readFileSync(join(process.cwd(), 'src/features/disclosures/components/ApproverDisclosuresPage.tsx'), 'utf8')
  it('المكوّن المشترك يستخدم ExecPageHeader وExecTabBar فقط، بلا h1 ولا خيار hero', () => {
    expect(src).toMatch(/<ExecPageHeader icon="[a-z-]+"/)
    expect(src).toMatch(/<ExecTabBar\b/)
    expect(src).not.toMatch(/<h1\b/)
    expect(src).not.toMatch(/\bhero\b/)
    expect(src).not.toMatch(/approver-tiles/)
  })
  it('صفحتا المعاون والمدير المفوض تستدعيانه بلا خيارات شكل', () => {
    for (const f of ['src/portals/deputy/pages/IncomingStatements.tsx', 'src/portals/admin/pages/AdminDisclosures.tsx']) {
      const page = readFileSync(join(process.cwd(), f), 'utf8')
      expect(page, f).toMatch(/<ApproverDisclosuresPage\s+testId=/)
    }
  })
})
