/** 00235: عقد تصميم بوابة المالية — كل وحداتها تستخدم الرأس الموحد (كحلي/ذهبي) مباشرة أو عبر مكوّنات الإدارة العليا المشتركة. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(process.cwd(), 'src/portals/finance/pages')
const OWN = ['Budget/BudgetOverview', 'Payroll/PayrollOverview', 'Purchases/MaintenancePurchases', 'Contractors/ContractorWagesPage', 'Advances/FinanceAdvancesPage', 'Settlements/FinanceSettlementsPage', 'Letters/FinanceLettersPage', 'Expenses/FinanceExpensesPage']
const SHARED = { 'Dashboard/FinanceDashboard': 'ExecHome', 'Reports/FinancialReports': 'ExecReports', 'Announcements/FinanceAnnouncements': 'AnnouncementsPage' }

describe('عقد تصميم بوابة المالية (00235)', () => {
  it('كل مسار في routes.tsx مغطّى', () => {
    const routes = readFileSync(join(process.cwd(), 'src/portals/finance/routes.tsx'), 'utf8')
    for (const m of routes.matchAll(/import\('\.\/pages\/([^']+)'\)/g)) expect([...OWN, ...Object.keys(SHARED)], m[1]).toContain(m[1])
  })
  it('الوحدات الخاصة تستخدم ExecPageHeader بلا رؤوس يدوية', () => {
    for (const name of OWN) {
      const src = readFileSync(join(dir, `${name}.tsx`), 'utf8')
      expect(src, name).toMatch(/<ExecPageHeader icon="[a-z-]+" title=/)
      expect(src, name).not.toMatch(/<h1\b/)
    }
  })
  it('الرئيسية والتقارير والإعلانات عبر المكوّنات المشتركة الموحدة', () => {
    for (const [page, shared] of Object.entries(SHARED)) expect(readFileSync(join(dir, `${page}.tsx`), 'utf8'), page).toContain(shared)
  })
})
