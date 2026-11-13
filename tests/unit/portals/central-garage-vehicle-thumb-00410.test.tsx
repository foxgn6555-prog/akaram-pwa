/**
 * 00410: صورة الآلية المكسورة في الانطلاقية وأرشيف الآليات وصفحة الآلية.
 * كان `<img src={undefined}>` يُرسم دون مصدر فيظهر رمز الصورة المكسورة (BROKEN_IMG في الفحص العميق).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VehicleThumb } from '@portals/central-garage/components/VehicleThumb'

vi.mock('@features/central-garage/hooks', () => {
  const vehicle = (over: Record<string, unknown>) => ({
    plateNumber: 'P',
    chassisNumber: 'C',
    vehicleCategory: 'large_compactor',
    ownershipType: 'owned',
    lessorName: null,
    rentalContractNo: null,
    rentalStartDate: null,
    rentalEndDate: null,
    modelYear: null,
    vehicleColor: null,
    specifications: null,
    shift: 'morning',
    sectorId: 4,
    areaName: 'الجادرية',
    parentSector: 'karrada',
    createdAt: 'now',
    updatedAt: 'now',
    archivedAt: null,
    archivedBy: null,
    ...over,
  })
  return {
    useGarageAreas: () => ({ data: [{ id: 4, name: 'الجادرية', parentSector: 'karrada' }] }),
    useGarageVehicles: () => ({
      data: {
        rows: [
          vehicle({ id: 'v-ok', vehicleName: 'كابسة', dbNumber: 'DB-1', imagePath: 'a/b.png', imageUrl: 'https://x/b.png', driverName: 'علي' }),
          // الرابط الموقّع لم يُنشأ (كائن محذوف/فشل توقيع) ⇒ لا imageUrl
          vehicle({ id: 'v-noimg', vehicleName: 'حاوية', dbNumber: 'DB-2', imagePath: 'a/c.png', imageUrl: undefined, driverName: 'حسن' }),
        ],
        totalCount: 2,
      },
      isLoading: false,
    }),
    useGarageDepartureDays: () => ({ data: [] }),
    useGarageDeparturesForDay: () => ({ data: [], isLoading: false }),
    useRecordGarageDeparture: () => ({ mutate: vi.fn(), isPending: false }),
    useRecordGarageReturn: () => ({ mutate: vi.fn(), isPending: false }),
    useGarageShiftAssignments: () => ({ data: [], refetch: vi.fn() }),
    useGarageShiftDispatchRecipients: () => ({ data: [] }),
    useRecordGarageShiftDeparture: () => ({ mutate: vi.fn(), isPending: false }),
  }
})

import DriversDispatchPage from '@portals/central-garage/pages/DriversDispatchPage'

describe('00410 — صورة الآلية بلا مصدر', () => {
  it('لا يرسم <img> بلا مصدر ويعرض بديلاً واضحاً في الانطلاقية', () => {
    const { container } = render(<DriversDispatchPage />)
    const images = [...container.querySelectorAll('img')]
    // لا صورة واحدة بمصدر فارغ أو غير موجود
    expect(images.filter((img) => !img.getAttribute('src'))).toHaveLength(0)
    // الصف الذي لا صورة له يعرض البديل
    expect(screen.getByTestId('dispatch-thumb-v-noimg-placeholder')).toBeInTheDocument()
    // والصف الذي له صورة يعرضها فعلاً
    expect(screen.getByTestId('dispatch-thumb-v-ok-img')).toHaveAttribute('src', 'https://x/b.png')
  })

  it('يعرض البديل إذا فشل تحميل الصورة (رابط موقّع منتهي)', () => {
    render(<VehicleThumb imageUrl="https://x/expired.png" imagePath="a/b.png" name="كابسة" className="size-16" />)
    const img = screen.getByTestId('vehicle-thumb-img')
    fireEvent.error(img)
    expect(screen.getByTestId('vehicle-thumb-placeholder')).toBeInTheDocument()
    expect(screen.queryByTestId('vehicle-thumb-img')).not.toBeInTheDocument()
  })

  it('يتجاهل صور الاستيراد غير المنشورة (import/) ويعرض البديل', () => {
    render(<VehicleThumb imageUrl="https://x/import.png" imagePath="import/x.png" name="حاوية" className="size-16" />)
    expect(screen.queryByTestId('vehicle-thumb-img')).not.toBeInTheDocument()
    expect(screen.getByTestId('vehicle-thumb-placeholder')).toHaveAccessibleName('بلا صورة — حاوية')
  })

  it('يرسم الصورة عندما يكون المصدر صالحاً', () => {
    render(<VehicleThumb imageUrl="https://x/ok.png" imagePath="a/ok.png" name="كابسة" className="size-16" />)
    expect(screen.getByRole('img', { name: 'صورة كابسة' })).toHaveAttribute('src', 'https://x/ok.png')
  })
})
