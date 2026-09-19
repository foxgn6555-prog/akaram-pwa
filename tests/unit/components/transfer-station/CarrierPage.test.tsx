/** وحدة ناقلة الحاويات المكبسية: الوقت تلقائي والوزن افتراضه الحمولة القياسية 16 طن */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockList = vi.fn()
const mockCreate = vi.fn().mockResolvedValue({ id: 'c1' })
vi.mock('@features/transfer-station', () => ({
  useCarrierList: () => ({ data: mockList(), isLoading: false }),
  useCreateCarrier: () => ({ mutate: mockCreate, isPending: false }),
}))

import CarrierPage from '@portals/transfer-station/pages/Carrier/CarrierPage'

beforeEach(() => { vi.clearAllMocks(); mockList.mockReturnValue([]) })

describe('CarrierPage — ناقلة حاويات مكبسية', () => {
  it('يفترض الحمولة القياسية 16 طن ويحفظها عند التسجيل المباشر', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><CarrierPage /></MemoryRouter>)
    expect(screen.getByTestId('carrier-page')).toBeInTheDocument()
    expect(screen.getByTestId('carrier-month')).toBeInTheDocument()
    expect(screen.queryByTestId('folder-carrier-send')).not.toBeInTheDocument()
    expect(screen.getByTestId('f-carrier-weight')).toHaveValue(16)
    await user.type(screen.getByTestId('f-carrier-name'), 'سائق الناقلة')
    await user.click(screen.getByTestId('carrier-submit'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ driver_name: 'سائق الناقلة', weight_tons: 16 }))
  })

  it('يرفض الحفظ دون اسم السائق', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><CarrierPage /></MemoryRouter>)
    await user.clear(screen.getByTestId('f-carrier-weight'))
    await user.click(screen.getByTestId('carrier-submit'))
    expect(mockCreate).not.toHaveBeenCalled()
    expect(screen.getByText('اسم السائق مطلوب (حرفان فأكثر)')).toBeInTheDocument()
    expect(screen.getByText('الوزن مطلوب بالطن (أكبر من صفر)')).toBeInTheDocument()
  })
})
