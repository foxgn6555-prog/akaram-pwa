/** Console · المصنّف: كل نوع خطأ يُكتشف ويُشرح — بما فيها أخطاء بوابة الإعلام */
import { describe, it, expect } from 'vitest'
import {
  classify,
  classifyKind,
  extractContractCode,
  fingerprintOf,
  portalFromPath,
  portalLabel,
  KIND_CATALOG,
  type ConsoleKind,
} from '@lib/console/classify'

describe('Console · classifyKind', () => {
  const cases: Array<[string, Parameters<typeof classifyKind>[0], ConsoleKind]> = [
    ['قطعة قديمة بعد نشر', { message: 'Failed to fetch dynamically imported module: https://x/assets/Page-abc.js' }, 'chunk_load'],
    ['تخزين ممتلئ', { message: "Failed to execute 'setItem' on 'Storage': QuotaExceededError" }, 'quota'],
    ['جلسة منتهية بالكود', { message: 'x', code: 'PGRST301' }, 'auth_expired'],
    ['جلسة منتهية بالحالة', { message: 'JWT expired', status: 401 }, 'auth_expired'],
    ['RLS 42501', { message: 'new row violates row-level security policy', code: '42501' }, 'permission'],
    ['كود تعاقدي _FORBIDDEN يُعد صلاحية', { message: 'CONSOLE_FORBIDDEN' }, 'permission'],
    ['دالة مفقودة PGRST202', { message: 'Could not find the function public.console_feed in the schema cache', code: 'PGRST202' }, 'rpc_missing'],
    ['عمود مفقود 42703', { message: 'column "level" does not exist', code: '42703' }, 'rpc_missing'],
    ['قيد فريد', { message: 'duplicate key value violates unique constraint "x"', code: '23505' }, 'db_constraint'],
    ['مهلة', { message: 'canceling statement due to statement timeout', code: '57014' }, 'timeout'],
    ['خادم 5xx', { message: 'Internal Server Error', status: 502 }, 'server_5xx'],
    ['انقطاع', { message: 'TypeError: Failed to fetch' }, 'offline'],
    ['بث حي', { message: 'Realtime channel error: CHANNEL_ERROR' }, 'realtime'],
    ['zod', { message: 'ZodError: invalid_type expected string received undefined' }, 'validation'],
    ['حاجز الشاشة', { message: 'boom', source: 'boundary' }, 'react_render'],
    ['تنبيه مفاتيح', { message: 'Warning: Encountered two children with the same key, `3`.' }, 'react_warning'],
    ['وصول فارغ', { message: "Cannot read properties of undefined (reading 'map')" }, 'null_access'],
    ['كود تعاقدي للإعلام', { message: 'MEDIA_DESIGN_LOCKED: التصميم مقفل' }, 'contract_code'],
    ['ملف مفقود', { message: 'تعذر تحميل الصورة: /x.png', source: 'asset' }, 'asset_missing'],
    ['غير مصنّف', { message: 'something odd happened' }, 'unknown'],
  ]
  it.each(cases)('%s', (_n, raw, kind) => {
    expect(classifyKind(raw)).toBe(kind)
  })

  it('كل نوع في الدليل له عنوان وشرح وخطوة حل واحدة على الأقل', () => {
    for (const k of Object.values(KIND_CATALOG)) {
      expect(k.title.length).toBeGreaterThan(3)
      expect(k.explanation.length).toBeGreaterThan(20)
      expect(k.actions.length).toBeGreaterThanOrEqual(1)
      expect(['critical', 'high', 'medium', 'low']).toContain(k.severity)
    }
    expect(Object.keys(KIND_CATALOG)).toHaveLength(17)
  })
})

describe('Console · البوابة من المسار', () => {
  it('خطأ في بوابة الإعلام يُنسب إلى الإعلام', () => {
    expect(portalFromPath('https://app.example/media/designs/5?x=1')).toBe('media')
    expect(portalLabel('media')).toBe('بوابة الإعلام')
  })
  it('مسارات أخرى', () => {
    expect(portalFromPath('/ops-room/transfer-station')).toBe('ops-room')
    expect(portalFromPath('/login')).toBe('public')
    expect(portalFromPath('/')).toBe('public')
    expect(portalFromPath('/nope')).toBe('unknown')
    expect(portalFromPath(null)).toBe('unknown')
  })
})

describe('Console · البصمة والكود التعاقدي', () => {
  it('البصمة ثابتة رغم اختلاف الأرقام والمعرّفات', () => {
    const a = fingerprintOf('null_access', 'media', 'Cannot read id 12 of 7d9e3b2a-1111-2222-3333-444444444444')
    const b = fingerprintOf('null_access', 'media', 'Cannot read id 99 of 00000000-0000-0000-0000-000000000000')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}$/)
    expect(fingerprintOf('null_access', 'hr', 'Cannot read id 12')).not.toBe(a)
  })
  it('extractContractCode يتجاهل أكواد Postgres/PostgREST', () => {
    expect(extractContractCode('SUPPLY_QTY_INVALID')).toBe('SUPPLY_QTY_INVALID')
    expect(extractContractCode('PGRST202 bla')).toBeNull()
    expect(extractContractCode('42501')).toBeNull()
    expect(extractContractCode('plain text')).toBeNull()
  })
  it('classify يجمع كل شيء: نوع + بوابة + مستوى + شرح', () => {
    const c = classify({ message: 'MEDIA_PERIOD_INVALID: فترة غير صالحة', url: 'https://x/media/reports' })
    expect(c.kind).toBe('contract_code')
    expect(c.portal).toBe('media')
    expect(c.level).toBe('error')
    expect(c.contractCode).toBe('MEDIA_PERIOD_INVALID')
    expect(c.info.actions[0]).toContain('APP_ERROR_AR')
    const w = classify({ message: 'Warning: Each child in a list should have a unique "key" prop.' })
    expect(w.level).toBe('warn')
  })
})
