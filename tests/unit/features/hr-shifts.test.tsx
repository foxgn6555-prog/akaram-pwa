/** 00376: شفتات HR في كل المنصة — السجل الحيّ، ShiftSelect، الخرائط القديمة تتحدث */
import { afterEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { ShiftSelect } from '@features/hr-shifts/ShiftSelect'
import { SHIFT_LABELS_LIVE, registerShiftOptions, resetShiftRegistry, shiftLabel, shiftLabelMap, type ShiftOption } from '@sdk/hr-shifts.sdk'
import { SHIFT_AR } from '@features/contractors/format'
import { SHIFT_LABELS } from '@features/sector/types'
import { STATUS_LABELS } from '@features/executive/lib/labels'

const extra: ShiftOption = { code: 'shift_2a9f1c0d', name: 'وجبة ثانية', start_time: '12:00:00', end_time: '20:00:00', grace_minutes: 15, is_active: true, sort_order: 100 }
const stopped: ShiftOption = { code: 'shift_old00001', name: 'شفت قديم', start_time: '01:00:00', end_time: '05:00:00', grace_minutes: 0, is_active: false, sort_order: 101 }
const base: ShiftOption[] = [
  { code: 'morning', name: 'الصباحي', start_time: '08:00:00', end_time: '16:00:00', grace_minutes: 10, is_active: true, sort_order: 1 },
  { code: 'evening', name: 'مسائي', start_time: '16:00:00', end_time: '00:00:00', grace_minutes: 10, is_active: true, sort_order: 2 },
  { code: 'night', name: 'ليلي', start_time: '00:00:00', end_time: '08:00:00', grace_minutes: 10, is_active: true, sort_order: 3 },
]

afterEach(() => resetShiftRegistry())

function Harness({ initial = 'morning', all = false }: { initial?: string; all?: boolean }) {
  const [v, setV] = useState(initial)
  return <><ShiftSelect value={v} onChange={setV} testId="sel" allLabel={all ? 'الكل' : undefined} /><output data-testid="val">{v}</output></>
}

describe('hr-shifts registry', () => {
  it('قبل التحميل: الشفتات الثلاث الاحتياطية؛ بعد التحميل: شفت HR الجديد يظهر فوراً في القائمة وبالاسم المحدَّث', () => {
    render(<Harness />)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['صباحي', 'مسائي', 'ليلي'])
    act(() => registerShiftOptions([...base, extra, stopped]))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['الصباحي', 'مسائي', 'ليلي', 'وجبة ثانية'])
    fireEvent.change(screen.getByTestId('sel'), { target: { value: 'shift_2a9f1c0d' } })
    expect(screen.getByTestId('val')).toHaveTextContent('shift_2a9f1c0d')
  })
  it('الموقوف لا يظهر إلا إن كان هو القيمة الحالية (لا تضيع)، وخيار «الكل» للفلاتر', () => {
    registerShiftOptions([...base, stopped])
    render(<Harness initial="shift_old00001" all />)
    const texts = screen.getAllByRole('option').map((o) => o.textContent)
    expect(texts[0]).toBe('الكل')
    expect(texts).toContain('شفت قديم')
    expect(texts.filter((t) => t === 'شفت قديم')).toHaveLength(1)
  })
  it('الخرائط القديمة في كل البوابات (SHIFT_AR/SHIFT_LABELS/STATUS_LABELS) تقرأ من السجل الحيّ', () => {
    expect(SHIFT_AR.morning).toBe('صباحي')
    expect(SHIFT_LABELS_LIVE.shift_2a9f1c0d).toBeUndefined()
    registerShiftOptions([...base, extra])
    expect(SHIFT_AR.shift_2a9f1c0d).toBe('وجبة ثانية')
    expect(SHIFT_LABELS.morning).toBe('الصباحي')
    expect(STATUS_LABELS.shift_2a9f1c0d).toBe('وجبة ثانية')
    expect(STATUS_LABELS.karrada).toBe('الكرادة')
    expect(shiftLabel('shift_2a9f1c0d')).toBe('وجبة ثانية')
    expect(shiftLabel('unknown_x')).toBe('unknown_x')
    expect(shiftLabel(null)).toBe('—')
    expect(Object.keys(shiftLabelMap())).toContain('shift_2a9f1c0d')
  })
})
