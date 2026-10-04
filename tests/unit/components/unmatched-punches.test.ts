import { describe, expect, it } from 'vitest'
import { groupUnmatchedPunches } from '@portals/hr/components/unmatched-punches'
import type { BiometricPunch } from '@features/integrations'

const p = (o: Partial<BiometricPunch>): BiometricPunch => ({ id: Math.random().toString(), device_serial: 'S1', pin: '1', employee_id: null, employee_name: null, employee_number: null, punched_at: '2026-10-04T05:00:00Z', direction: 'in', person_name: null, method: 'adms_push', ...o })

describe('groupUnmatchedPunches', () => {
  it('يتجاهل المطابَقة ويجمع يوم×PIN بأول/آخر بصمة وعدّاد واسم الجهاز إن وُجد', () => {
    const rows = groupUnmatchedPunches([
      p({ pin: '373', punched_at: '2026-10-04T15:40:00Z', device_user_name: 'كريم' }),
      p({ pin: '373', punched_at: '2026-10-04T15:03:00Z' }),
      p({ pin: '373', punched_at: '2026-10-03T05:03:00Z' }),
      p({ pin: '9', employee_id: 'e1', punched_at: '2026-10-04T05:03:00Z' }),
    ])
    expect(rows.map((r) => r.key)).toEqual(['373|2026-10-04', '373|2026-10-03'])
    expect(rows[0]).toMatchObject({ count: 2, firstAt: '2026-10-04T15:03:00Z', lastAt: '2026-10-04T15:40:00Z', deviceName: 'كريم' })
    expect(rows[1]).toMatchObject({ count: 1, deviceName: null })
  })
  it('الترتيب: الأحدث أولاً ثم PIN رقمياً', () => {
    const rows = groupUnmatchedPunches([p({ pin: '10' }), p({ pin: '9' }), p({ pin: '9', punched_at: '2026-10-05T05:00:00Z' })])
    expect(rows.map((r) => `${r.day}/${r.pin}`)).toEqual(['2026-10-05/9', '2026-10-04/9', '2026-10-04/10'])
  })
})
