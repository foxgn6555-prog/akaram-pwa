/** 00236: عقد تصميم بوابة الشكاوى — كل وحداتها تستخدم الرأس الموحد (كحلي/ذهبي) مباشرة أو عبر ComplaintPageHeader الذي يغلّفه. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(process.cwd(), 'src/portals/complaints/pages')
const DIRECT = ['Dashboard/DashboardPage', 'Processing/ProcessingPage', 'Processing/ComplaintDetailPage', 'Templates/TemplatesPage', 'Templates/ReportEditorPage', 'Settings/SettingsPage', 'Archive/ArchivePage', 'Support/SupportPage', 'Guidance/GuidancePage']
const VIA_WRAPPER = ['Inbox/InboxPage', 'Assignment/AssignmentPage', 'Data/DataPage', 'Database/DatabasePage']

describe('عقد تصميم بوابة الشكاوى (00236)', () => {
  it('كل مسار في routes.tsx مغطّى', () => {
    const routes = readFileSync(join(process.cwd(), 'src/portals/complaints/routes.tsx'), 'utf8')
    for (const m of routes.matchAll(/import\('\.\/pages\/([^']+)'\)/g)) expect([...DIRECT, ...VIA_WRAPPER], m[1]).toContain(m[1])
  })
  it('ComplaintPageHeader يغلّف ExecPageHeader', () => {
    const ui = readFileSync(join(process.cwd(), 'src/portals/complaints/components/ComplaintUi.tsx'), 'utf8')
    expect(ui).toMatch(/export function ComplaintPageHeader[\s\S]*?<ExecPageHeader icon="[a-z-]+"/)
  })
  it('الوحدات المباشرة تستخدم ExecPageHeader، ووحدات البريد/الإسناد/البيانات/القاعدة تستخدم الغلاف', () => {
    for (const name of DIRECT) expect(readFileSync(join(dir, `${name}.tsx`), 'utf8'), name).toMatch(/<ExecPageHeader icon="[a-z-]+"/)
    for (const name of VIA_WRAPPER) expect(readFileSync(join(dir, `${name}.tsx`), 'utf8'), name).toMatch(/<ComplaintPageHeader\b/)
  })
  it('لا رؤوس h1 ولا رؤوس متدرجة قديمة في صفحات الشكاوى', () => {
    for (const name of [...DIRECT, ...VIA_WRAPPER]) {
      const src = readFileSync(join(dir, `${name}.tsx`), 'utf8')
      expect(src, name).not.toMatch(/<h1\b/)
      expect(src, name).not.toMatch(/<header className="[^"]*bg-gradient-to-l/)
    }
  })
})
