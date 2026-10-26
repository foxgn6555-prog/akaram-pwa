/**
 * 00350-C — واجهات الصلاحيات: بطاقة المستخدم (قالب · معاينة بمصدر · استثناء بنقرة · إزالة · حمايات) وصفحة القوالب (إنشاء · قواعد · حذف مقفل عند الاستخدام)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'

const TPL = { id: 't1', name: 'موارد بشرية — قراءة فقط', description: null, is_active: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', users_count: 1 }
const TPL2 = { ...TPL, id: 't2', name: 'قالب فارغ', users_count: 0 }
const eff = (unit_key: string, label: string, action: string, allowed: boolean, source: string, reason: string | null = null, parent_key: string | null = null) =>
  ({ unit_key, portal: 'hr', label, parent_key, sort: 0, action, allowed, source, reason })
const EFFECTIVE = [
  eff('hr', 'الرئيسية', 'view', true, 'role'),
  eff('hr.employees', 'الموظفون', 'view', true, 'role'), eff('hr.employees', 'الموظفون', 'edit', false, 'template'),
  eff('hr.leaves', 'الإجازات', 'view', false, 'override', 'لا يتعامل مع الإجازات'),
]
const h = vi.hoisted(() => ({
  templates: vi.fn(async () => [] as unknown[]), templateRules: vi.fn(async () => [] as unknown[]),
  templateSave: vi.fn(async () => 't9'), templateRulesSet: vi.fn(async () => 1), templateDelete: vi.fn(async () => undefined),
  userTemplate: vi.fn(async () => null as unknown), userTemplateSet: vi.fn(async () => undefined),
  userOverrides: vi.fn(async () => [] as unknown[]), userOverrideSet: vi.fn(async () => undefined),
  userEffective: vi.fn(async () => [] as unknown[]), audit: vi.fn(async () => [] as unknown[]),
}))
vi.mock('@sdk/permissions.sdk', async (orig) => ({ ...(await orig<object>()), permissions: h }))

import { PermissionsCard } from '@portals/it/pages/UserManagement/PermissionsCard'
import PermissionTemplates from '@portals/it/pages/Permissions/PermissionTemplates'

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('⚓ بطاقة صلاحيات المستخدم', () => {
  beforeEach(() => { vi.clearAllMocks(); h.templates.mockResolvedValue([TPL, TPL2]); h.userEffective.mockResolvedValue(EFFECTIVE); h.userTemplate.mockResolvedValue({ user_id: 'u1', template_id: 't1', assigned_at: 'x' }) })

  it('تعرض القالب المسنَد والمعاينة بمصدر كل إجراء والاستثناءات', async () => {
    wrap(<PermissionsCard userId="u1" roles={['hr_officer']} isSelf={false} />)
    await waitFor(() => expect((screen.getByTestId('perm-template-select') as HTMLSelectElement).value).toBe('t1'))
    await waitFor(() => expect(screen.getByTestId('perm-hr.employees-edit')).toHaveAttribute('data-effect', 'deny'))
    expect(screen.getByTestId('perm-hr.employees-edit')).toHaveAttribute('data-source', 'template')
    expect(screen.getByTestId('perm-hr.leaves-view')).toHaveAttribute('data-source', 'override')
    expect(within(screen.getByTestId('perm-overrides')).getByText(/لا يتعامل مع الإجازات/)).toBeInTheDocument()
    // بوابات دوره فقط افتراضياً — ثم كل البوابات
    expect(screen.queryByTestId('perm-portal-finance')).toBeNull()
    fireEvent.click(screen.getByTestId('perm-show-all'))
    expect(screen.getByTestId('perm-portal-finance')).toBeInTheDocument()
  })

  it('نقرة على إجراء مسموح من الدور ⇒ استثناء «ممنوع» مع السبب؛ نقرة على استثناء ممنوع ⇒ مسموح؛ إزالة من القائمة', async () => {
    wrap(<PermissionsCard userId="u1" roles={['hr_officer']} isSelf={false} />)
    await waitFor(() => expect(screen.getByTestId('perm-hr.employees-view')).toHaveAttribute('data-effect', 'allow'))
    fireEvent.change(screen.getByTestId('perm-reason'), { target: { value: 'تجربة' } })
    fireEvent.click(screen.getByTestId('perm-hr.employees-view'))
    await waitFor(() => expect(h.userOverrideSet).toHaveBeenCalledWith('u1', 'hr.employees', 'view', 'deny', 'تجربة'))
    await waitFor(() => expect(screen.getByTestId('perm-hr.leaves-view')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('perm-hr.leaves-view'))
    await waitFor(() => expect(h.userOverrideSet).toHaveBeenCalledWith('u1', 'hr.leaves', 'view', 'allow', 'تجربة'))
    await waitFor(() => expect(screen.getByTestId('perm-hr.leaves-view')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('perm-override-clear-hr.leaves-view'))
    await waitFor(() => expect(h.userOverrideSet).toHaveBeenCalledWith('u1', 'hr.leaves', 'view', null, null))
    // «عرض» رئيسية بوابته ثابت — لا استدعاء
    h.userOverrideSet.mockClear()
    fireEvent.click(screen.getByTestId('perm-hr-view'))
    expect(h.userOverrideSet).not.toHaveBeenCalled()
  })

  it('تغيير القالب يستدعي الإسناد؛ الحساب نفسه ومدير النظام الأعلى عرض فقط', async () => {
    const { unmount } = wrap(<PermissionsCard userId="u1" roles={['hr_officer']} isSelf={false} />)
    await waitFor(() => expect(screen.getByTestId('perm-template-select')).not.toBeDisabled())
    fireEvent.change(screen.getByTestId('perm-template-select'), { target: { value: '' } })
    await waitFor(() => expect(h.userTemplateSet).toHaveBeenCalledWith('u1', null))
    unmount()
    const r2 = wrap(<PermissionsCard userId="me" roles={['it_admin']} isSelf />)
    await waitFor(() => expect(screen.getByTestId('perm-template-select')).toBeDisabled())
    expect(screen.queryByTestId('perm-reason')).toBeNull()
    r2.unmount()
    wrap(<PermissionsCard userId="sa" roles={['super_admin']} isSelf={false} />)
    expect(screen.queryByTestId('perm-template-select')).toBeNull()
    expect(screen.getByText(/كل الصلاحيات دائماً/)).toBeInTheDocument()
  })
})

describe('⚓ صفحة قوالب الصلاحيات', () => {
  beforeEach(() => { vi.clearAllMocks(); h.templates.mockResolvedValue([TPL, TPL2]); h.templateRules.mockResolvedValue([{ template_id: 't1', unit_key: 'hr.employees', action: 'edit', effect: 'deny' }]) })

  it('إنشاء قالب ثم حفظ قواعده بالتبديل (بلا ← ممنوع ← مسموح)', async () => {
    wrap(<PermissionTemplates />)
    await screen.findByTestId('tpl-t1')
    fireEvent.click(screen.getByTestId('tpl-new'))
    fireEvent.change(screen.getByTestId('tpl-name'), { target: { value: 'قالب جديد' } })
    fireEvent.click(screen.getByTestId('tpl-create'))
    await waitFor(() => expect(h.templateSave).toHaveBeenCalledWith({ name: 'قالب جديد', description: '' }))
    fireEvent.click(screen.getByTestId('tpl-t1'))
    await waitFor(() => expect(screen.getByTestId('perm-hr.employees-edit')).toHaveAttribute('data-effect', 'deny'))
    expect(screen.getByTestId('tpl-rules-save')).toBeDisabled()
    fireEvent.click(screen.getByTestId('perm-hr.leaves-view'))            // بلا ← ممنوع
    fireEvent.click(screen.getByTestId('perm-hr.employees-edit'))         // ممنوع ← مسموح
    expect(screen.getByTestId('perm-hr.leaves-view')).toHaveAttribute('data-effect', 'deny')
    expect(screen.getByTestId('perm-hr.employees-edit')).toHaveAttribute('data-effect', 'allow')
    fireEvent.click(screen.getByTestId('tpl-rules-save'))
    await waitFor(() => expect(h.templateRulesSet).toHaveBeenCalledWith('t1', expect.arrayContaining([
      { unit_key: 'hr.employees', action: 'edit', effect: 'allow' }, { unit_key: 'hr.leaves', action: 'view', effect: 'deny' },
    ])))
  })

  it('الحذف مقفل لقالب مستخدم ومتاح لقالب فارغ؛ التعطيل يستدعي الحفظ', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    wrap(<PermissionTemplates />)
    fireEvent.click(await screen.findByTestId('tpl-t1'))
    await waitFor(() => expect(screen.getByTestId('tpl-delete')).toBeDisabled())
    fireEvent.click(screen.getByTestId('tpl-toggle-active'))
    await waitFor(() => expect(h.templateSave).toHaveBeenCalledWith({ id: 't1', name: TPL.name, description: null, is_active: false }))
    fireEvent.click(screen.getByTestId('tpl-t2'))
    await waitFor(() => expect(screen.getByTestId('tpl-delete')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('tpl-delete'))
    await waitFor(() => expect(h.templateDelete).toHaveBeenCalledWith('t2'))
  })
})
