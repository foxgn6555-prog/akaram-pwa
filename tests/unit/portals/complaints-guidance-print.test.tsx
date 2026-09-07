import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GuidancePage from '../../../src/portals/complaints/pages/Guidance/GuidancePage'
import ComplaintsGuidancePage from '../../../src/portals/manager/pages/Complaints/ComplaintsGuidancePage'

const print = vi.fn()
beforeEach(() => { print.mockClear(); vi.stubGlobal('print', print) })
const view = (node: ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>)

describe('أدلة بوابة الشكاوى القابلة للطباعة', () => {
  it('يغطي دليل الموظف الدورة الكاملة ويطبع عند الطلب', () => {
    view(<GuidancePage />)
    expect(screen.getByText('1. استلام البريد')).toBeInTheDocument()
    expect(screen.getByText('8. الأرشفة والحذف')).toBeInTheDocument()
    expect(screen.getByText('أخطاء يجب إيقاف العمل عند اكتشافها')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'طباعة الدليل / حفظ PDF' }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('يوضح دليل المسؤول المطابقة والرفع الجماعي ويمنع تعديل الموقع وGPS', () => {
    view(<ComplaintsGuidancePage />)
    expect(screen.getByText('طابق الصور واحداً لواحد')).toBeInTheDocument()
    expect(screen.getByText(/لا يجوز تعديلها أو إدخال GPS/)).toBeInTheDocument()
    expect(screen.getByText('متى لا ترسل التذكرة؟')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'طباعة الدليل / حفظ PDF' }))
    expect(print).toHaveBeenCalledTimes(1)
  })
})
