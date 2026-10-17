/** 00275 — دليل التشغيل التقني: عقد المحتوى (كل أمر مشروح بالكامل) + العارض (نسخ، خطورة، طي) + الـ Hub */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { GUIDES, findGuide } from '@features/devops-guide'
import { GuideRenderer } from '@features/devops-guide/GuideRenderer'
import DevOpsHub from '@portals/it/pages/DevOps/DevOpsHub'
import DevOpsGuidePage from '@portals/it/pages/DevOps/DevOpsGuidePage'

describe('عقد محتوى الأدلة', () => {
  it('كل أمر له: الأمر، ماذا يفعل، متى، مثال، إن فشل — ولا يوجد نص فارغ؛ والمعرّفات فريدة', () => {
    for (const g of GUIDES) {
      expect(g.sections.length).toBeGreaterThan(0)
      const ids = g.sections.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const s of g.sections) {
        for (const c of s.commands ?? []) {
          for (const k of ['cmd', 'what', 'when', 'example', 'ifFails'] as const) expect(c[k].trim(), `${g.slug}/${s.id}/${c.cmd}/${k}`).not.toBe('')
        }
        for (const c of s.concepts ?? []) expect(c.meaning.trim() && c.example.trim()).toBeTruthy()
      }
    }
  })
  it('دليل Git يغطي سير عملنا: git am --3way، supabase db push، push إلى local-main-20260920، وأوامر الإنقاذ موسومة بالخطر', () => {
    const g = findGuide('git')!
    const all = JSON.stringify(g)
    expect(all).toContain('git am --3way')
    expect(all).toContain('npx supabase db push')
    expect(all).toContain('git push origin port-00134:local-main-20260920')
    const rescue = g.sections.find((s) => s.id === 'rescue')!
    expect(rescue.commands!.find((c) => c.cmd.startsWith('git reset --hard'))!.danger).toBe('danger')
  })
  it('00276: دليل قاعدة البيانات يغطي db push والقواعد الذهبية؛ دليل الاختبارات يغطي الأنواع الستة وأوامر التشغيل', () => {
    const db = JSON.stringify(findGuide('database')!)
    expect(db).toContain('npx supabase db push')
    expect(db).toContain('--dry-run')
    expect(db).toContain('لا يُعدَّل أبداً')
    const t = findGuide('tests')!
    expect(t.sections.find((s) => s.id === 'types')!.concepts).toHaveLength(6)
    const tj = JSON.stringify(t)
    for (const c of ['npm test', 'npm run typecheck', 'npm run lint', 'npm run build', 'node scripts/db-migrations-test.mjs']) expect(tj).toContain(c)
    expect(GUIDES.map((g) => g.slug)).toEqual(['git', 'database', 'tests', 'hosting'])
  })
  it('00277: دليل الاستضافة — النشر الأول بالترتيب، تحديث القاعدة قبل الواجهة، والبصمة في الإنتاج تغطي الأنماط الأربعة والدوال الطرفية', () => {
    const h = findGuide('hosting')!
    expect(h.sections.map((s) => s.id)).toEqual(['map', 'first', 'update', 'biometric'])
    const first = h.sections.find((s) => s.id === 'first')!.steps!.map((s) => s.title)
    expect(first.findIndex((t) => t.includes('ابنِ'))).toBeLessThan(first.findIndex((t) => t.includes('public_html')))
    expect(first.findIndex((t) => t.includes('public_html'))).toBeLessThan(first.findIndex((t) => t.includes('Supabase بعنوان')))
    const upd = h.sections.find((s) => s.id === 'update')!.commands!.map((c) => c.cmd)
    expect(upd.indexOf('npx supabase db push')).toBeLessThan(upd.indexOf('npm run build'))
    const bio = JSON.stringify(h.sections.find((s) => s.id === 'biometric'))
    for (const k of ['app_api_pull', 'ADMS', 'zk-bridge', 'generic_pull', 'adms-receiver', 'biometric-pull', 'biometric-bridge', 'gps-receiver']) expect(bio).toContain(k)
    expect(JSON.stringify(h)).toContain('.htaccess')
    expect(JSON.stringify(h)).not.toMatch(/service_role=|VITE_SERVICE/)
  })
})

describe('العارض والصفحات', () => {
  it('يعرض التنبيه والأقسام، ينسخ الأمر، ويطوي/يفتح الأقسام', () => {
    const write = vi.fn(); Object.assign(navigator, { clipboard: { writeText: write } })
    render(<GuideRenderer guide={findGuide('git')!} />)
    expect(screen.getByTestId('guide-notice')).toHaveTextContent('القاعدة الذهبية')
    // القسم الثالث مطويّ افتراضياً
    const daily = screen.getByTestId('section-daily')
    expect(within(daily).queryByTestId('cmd-daily-0')).toBeNull()
    fireEvent.click(within(daily).getByRole('button', { expanded: false }))
    expect(within(daily).getByTestId('cmd-daily-0')).toHaveTextContent('git status')
    fireEvent.click(within(daily).getByTestId('copy-daily-0'))
    expect(write).toHaveBeenCalledWith('git status')
    expect(within(daily).getByTestId('cmd-daily-0')).toHaveTextContent('آمن')
  })
  it('الـ Hub يعرض رابط دليل Git وعدد الأوامر؛ وslug غير معروف يعيد إلى الوحدة', () => {
    render(<MemoryRouter initialEntries={['/it/devops']}><Routes><Route path="/it/devops" element={<DevOpsHub />} /></Routes></MemoryRouter>)
    expect(screen.getByTestId('hub-devops')).toHaveTextContent('Git ورفع التحديثات')
    expect(screen.getByTestId('devops-stats')).toHaveTextContent('الأوامر المشروحة')
    render(<MemoryRouter initialEntries={['/it/devops/nope']}><Routes><Route path="/it/devops" element={<div data-testid="hub-redirect" />} /><Route path="/it/devops/:slug" element={<DevOpsGuidePage />} /></Routes></MemoryRouter>)
    expect(screen.getByTestId('hub-redirect')).toBeInTheDocument()
  })
})

/** 00280 — اختبار واقعي: مسارات البوابة التقنية كما يبنيها المولّد فعلاً + متصفح وهمي على /it/devops/git ⇒ يظهر الدليل لا «قيد التطوير» ولا تحويل */
describe('المسارات الحقيقية للبوابة التقنية (00280)', () => {
  it.each(['git', 'database', 'tests', 'hosting'])('/it/devops/%s يعرض الدليل نفسه عبر المولّد', async (slug) => {
    const { buildPortalRoutes } = await import('@router/unit-routes')
    const { customRoutes } = await import('@portals/it/routes')
    const { PORTALS } = await import('@lib/constants/portals.constants')
    const { createMemoryRouter, RouterProvider } = await import('react-router')
    const router = createMemoryRouter([{ path: '/it', children: buildPortalRoutes(PORTALS.IT, customRoutes) }], { initialEntries: [`/it/devops/${slug}`] })
    render(<RouterProvider router={router} />)
    expect(await screen.findByTestId('guide-notice', {}, { timeout: 5000 })).toHaveTextContent(findGuide(slug)!.notice!)
    expect(router.state.location.pathname).toBe(`/it/devops/${slug}`)
    expect(screen.queryByText(/قيد التطوير/)).toBeNull()
  })
})
