/** عقود Zod لوحدة «مسؤول القسم» — العمال/الآليات/الطلبات/الأعطال/إسناد المدير */
import { describe, it, expect } from 'vitest'
import {
  workerSchema,
  vehicleSchema,
  supplySchema,
  breakdownSchema,
  managerProfileSchema,
} from '@features/sector'
import { createSuperAdminSchema } from '@features/user-management'

describe('عقود مسؤول القسم', () => {
  describe('workerSchema', () => {
    const base = { full_name: 'علي حسن', phone: '07701234567', sector_id: 2, shift: 'morning', job_title: '' }
    it('يقبل عاملاً صحيحاً', () => {
      expect(workerSchema.safeParse(base).success).toBe(true)
    })
    it('يرفض اسماً أقل من حرفين', () => {
      expect(workerSchema.safeParse({ ...base, full_name: 'ع' }).success).toBe(false)
    })
    it('يرفض قاطعاً خارج 1–8', () => {
      expect(workerSchema.safeParse({ ...base, sector_id: 9 }).success).toBe(false)
      expect(workerSchema.safeParse({ ...base, sector_id: 0 }).success).toBe(false)
    })
    it('يرفض شفتاً غير معروف', () => {
      expect(workerSchema.safeParse({ ...base, shift: 'weekend' }).success).toBe(false)
    })
    it('يقبل سلسلة رقم القاطع (إرسال select)', () => {
      expect(workerSchema.safeParse({ ...base, sector_id: '3' }).success).toBe(true)
    })
  })

  describe('vehicleSchema', () => {
    const base = { db_number: 'DB-12', vehicle_type: 'قلابية', sector_id: 1, shift: 'night', driver_name: '' }
    it('يقبل آلية صحيحة', () => {
      expect(vehicleSchema.safeParse(base).success).toBe(true)
    })
    it('يرفض رقم DB فارغاً', () => {
      expect(vehicleSchema.safeParse({ ...base, db_number: '' }).success).toBe(false)
    })
  })

  describe('supplySchema', () => {
    const base = { supply_type: 'أكياس نفايات', quantity: 50, notes: '', signed: true }
    it('يقبل طلباً موقّعاً', () => {
      expect(supplySchema.safeParse(base).success).toBe(true)
    })
    it('يرفض الإرسال بدون إقرار التوقيع الإلكتروني', () => {
      expect(supplySchema.safeParse({ ...base, signed: false }).success).toBe(false)
    })
    it('يرفض عدداً غير موجب أو غير صحيح', () => {
      expect(supplySchema.safeParse({ ...base, quantity: 0 }).success).toBe(false)
      expect(supplySchema.safeParse({ ...base, quantity: 2.5 }).success).toBe(false)
    })
    it('يرفض نوع مستلزمات أقل من 3 أحرف', () => {
      expect(supplySchema.safeParse({ ...base, supply_type: 'كز' }).success).toBe(false)
    })
  })

  describe('breakdownSchema', () => {
    const base = { db_number: 'DB-7', fault_type: 'عطل هيدروليك', notes: '' }
    it('يقبل بلاغاً صحيحاً', () => {
      expect(breakdownSchema.safeParse(base).success).toBe(true)
    })
    it('يرفض نوع عطل قصيراً', () => {
      expect(breakdownSchema.safeParse({ ...base, fault_type: 'عط' }).success).toBe(false)
    })
  })

  describe('managerProfileSchema (الإسناد)', () => {
    it('يقبل منطقة واحدة أو جميع المناطق الثماني', () => {
      expect(managerProfileSchema.safeParse({ shift: 'morning', sectors: [1] }).success).toBe(true)
      expect(managerProfileSchema.safeParse({ shift: 'evening', sectors: [1, 2, 3, 4, 5, 6, 7, 8] }).success).toBe(true)
    })
    it('يرفض صفر مناطق', () => {
      expect(managerProfileSchema.safeParse({ shift: 'morning', sectors: [] }).success).toBe(false)
    })
    it('يرفض قاطعاً خارج الثمانية', () => {
      expect(managerProfileSchema.safeParse({ shift: 'night', sectors: [9] }).success).toBe(false)
    })
  })

  describe('createSuperAdminSchema مع إسناد مسؤول القسم', () => {
    const validUser = {
      email: 'mgr@akram.iq', password: 'Passw0rd1', full_name: 'مسؤول قاطع',
      role: 'department_manager', employee_number: '', department_id: '', job_title: '',
    }
    it('يقبل مسؤول قسم بشفت وقاطع واحد', () => {
      const r = createSuperAdminSchema.safeParse({ ...validUser, manager_shift: 'morning', manager_sectors: [1] })
      expect(r.success).toBe(true)
    })
    it('يرفض مسؤول قسم بلا شفت', () => {
      const r = createSuperAdminSchema.safeParse({ ...validUser, manager_sectors: [1] })
      expect(r.success).toBe(false)
    })
    it('يرفض مسؤول قسم بلا قواطع', () => {
      const r = createSuperAdminSchema.safeParse({ ...validUser, manager_shift: 'night', manager_sectors: [] })
      expect(r.success).toBe(false)
    })
    it('يقبل إسناد القاطعين بجميع المناطق', () => {
      const r = createSuperAdminSchema.safeParse({ ...validUser, manager_shift: 'night', manager_sectors: [1, 2, 3, 4, 5, 6, 7, 8] })
      expect(r.success).toBe(true)
    })
    it('لا يطلب الإسناد للأدوار الأخرى', () => {
      const r = createSuperAdminSchema.safeParse({ ...validUser, role: 'employee' })
      expect(r.success).toBe(true)
    })
  })
})
