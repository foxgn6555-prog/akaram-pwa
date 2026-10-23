/** 00334: تنظيف خطوات السلسلة قبل الإرسال — الحقول الاختيارية فقط عند الحاجة */
import { describe, expect, it, vi } from 'vitest'
vi.mock('@sdk/client', () => ({ supabase: { rpc: vi.fn() } }))
import { cleanStep } from '@sdk/sector-manager.sdk'

describe('cleanStep', () => {
  it('خطوة بسيطة: بلا حقول إضافية', () => {
    expect(cleanStep({ kind: 'hierarchy', role: 'admin_ops', label: 'x', mode: 'any', escalate: 'none', sla_days: null, condition: null })).toEqual({ kind: 'hierarchy', role: 'admin_ops' })
  })
  it('خطوة كاملة: الجميع + شرط + مهلة + تصعيد', () => {
    expect(cleanStep({ kind: 'account', user_id: 'u1', mode: 'all', condition: { field: 'amount', op: 'gte', value: 500000 }, sla_days: 3, escalate: 'next' }))
      .toEqual({ kind: 'account', user_id: 'u1', mode: 'all', condition: { field: 'amount', op: 'gte', value: 500000 }, sla_days: 3, escalate: 'next' })
  })
})
