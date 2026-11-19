import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ManualRecordersPicker, recorderOptionFromGrant, type ManualRecorderOption } from '@features/attendance-manual/components/ManualRecordersPicker'
import type { PlatformUser } from '@sdk/users.sdk'

const h = vi.hoisted(() => ({ useUsers: vi.fn() }))
vi.mock('@features/user-management', () => ({ useUsers: (...args: unknown[]) => h.useUsers(...args) }))

const user = (id: string, roles: string[]): PlatformUser => ({
  id,
  email: `${id}@example.test`,
  created_at: '2026-01-01T00:00:00Z',
  last_sign_in_at: null,
  banned_until: null,
  roles: roles as PlatformUser['roles'],
  employee_id: null,
  employee_name: id,
  employee_number: null,
  phone: null,
  job_title: null,
  department_id: null,
  department_name: null,
})

const selected = (id: string): ManualRecorderOption => ({
  id, name: id, email: `${id}@example.test`, roles: ['transfer_station'], hasPortalRole: true, isOpsRoom: false,
})

beforeEach(() => {
  h.useUsers.mockReset()
  h.useUsers.mockReturnValue({ data: [], isLoading: false, isError: false })
})

describe('اختيار حسابات التسجيل الإضافية', () => {
  it('لا يتيح إلا دور البوابة أو ops_room، ولا يسمح بحساب بلا دور', () => {
    const onChange = vi.fn()
    h.useUsers.mockReturnValue({
      data: [user('station', ['transfer_station']), user('hr', ['hr_officer']), user('ops', ['ops_room']), user('none', [])],
      isLoading: false,
      isError: false,
    })
    render(<ManualRecordersPicker portalId="transfer-station" accounts={[]} onChange={onChange} />)

    fireEvent.change(screen.getByTestId('am-recorder-search'), { target: { value: 'ac' } })
    expect(h.useUsers).toHaveBeenLastCalledWith('ac', true)
    expect(screen.getByTestId('am-recorder-option-station')).toBeEnabled()
    expect(screen.getByTestId('am-recorder-option-ops')).toBeEnabled()
    expect(screen.getByTestId('am-recorder-option-hr')).toBeDisabled()
    expect(screen.getByTestId('am-recorder-option-none')).toBeDisabled()
    expect(screen.getByTestId('am-recorder-options')).toHaveTextContent('يلزم إسناد دور البوابة أولاً')

    fireEvent.click(screen.getByTestId('am-recorder-option-station'))
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'station', hasPortalRole: true, isOpsRoom: false })])
  })

  it('يعدّ حساب ops_room ضمن القائمة للتوثيق مع إظهار صلاحية الغرفة الافتراضية', () => {
    const ops = {
      id: 'ops-user', name: 'ops-user', email: 'ops-user@example.test', roles: ['ops_room'],
      hasPortalRole: false, isOpsRoom: true,
    }
    render(<ManualRecordersPicker portalId="transfer-station" accounts={[ops]} onChange={vi.fn()} />)
    expect(screen.getByTestId('am-recorder-selected')).toHaveTextContent('غرفة العمليات — صلاحية افتراضية، موثّقة هنا')
    expect(screen.getByText('حسابات التسجيل الإضافية (1/5)')).toBeInTheDocument()
  })

  it('يلتزم بسقف خمسة حتى عند وجود حسابات صالحة أخرى في نتائج البحث', () => {
    const onChange = vi.fn()
    h.useUsers.mockReturnValue({ data: [user('sixth', ['transfer_station'])], isLoading: false, isError: false })
    render(<ManualRecordersPicker portalId="transfer-station" accounts={['1', '2', '3', '4', '5'].map(selected)} onChange={onChange} />)
    fireEvent.change(screen.getByTestId('am-recorder-search'), { target: { value: 'si' } })
    expect(screen.getByTestId('am-recorder-option-sixth')).toBeDisabled()
    expect(screen.getByTestId('am-recorder-limit')).toHaveTextContent('اكتمل الحد الأقصى (5)')
  })

  it('يعيد بناء أهلية الحساب من الدور الحالي وبوابة التفعيل عند فتح القائمة المحفوظة', () => {
    const grant = {
      user_id: 'station', name: 'محطة', email: 'station@example.test', roles: ['transfer_station'],
      granted_by_name: 'IT', granted_at: '2026-11-14T08:00:00Z',
    }
    expect(recorderOptionFromGrant(grant, 'transfer-station')).toMatchObject({ hasPortalRole: true, isOpsRoom: false })
    expect(recorderOptionFromGrant(grant, 'hr')).toMatchObject({ hasPortalRole: false, isOpsRoom: false })
  })
})
