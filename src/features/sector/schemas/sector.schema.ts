/** Zod — عقود وحدة «مسؤول القسم» */
import { z } from 'zod'

export const shiftEnum = z.enum(['morning', 'evening', 'night'])

/** عامل فريق */
export const workerSchema = z.object({
  full_name: z.string().min(2, 'اسم العامل مطلوب (حرفان فأكثر)').max(80),
  phone: z.string().max(20).optional().or(z.literal('')),
  sector_id: z.coerce.number({ error: 'اختر القاطع' }).int().min(1, 'اختر القاطع').max(8),
  shift: shiftEnum,
  job_title: z.string().max(60).optional().or(z.literal('')),
})
export type WorkerFormInput = z.infer<typeof workerSchema>

/** آلية */
export const vehicleSchema = z.object({
  db_number: z.string().min(1, 'رقم DB مطلوب').max(30, 'الرقم طويل'),
  vehicle_type: z.string().max(50).optional().or(z.literal('')),
  sector_id: z.coerce.number({ error: 'اختر القاطع' }).int().min(1, 'اختر القاطع').max(8),
  shift: shiftEnum,
  driver_name: z.string().max(80).optional().or(z.literal('')),
})
export type VehicleFormInput = z.infer<typeof vehicleSchema>

/** طلب مستلزمات قاطع */
export const supplySchema = z.object({
  supply_type: z.string().min(3, 'اكتب نوع المستلزمات المطلوبة (3 أحرف فأكثر)').max(300),
  quantity: z.coerce.number({ error: 'العدد مطلوب' }).int('العدد رقم صحيح').positive('العدد أكبر من صفر'),
  notes: z.string().max(1000).optional().or(z.literal('')),
  signed: z.literal(true, { error: 'يجب تأكيد الإقرار (التوقيع الإلكتروني) للإرسال' }),
})
export type SupplyFormInput = z.infer<typeof supplySchema>

/** بلاغ عطل آلية */
export const breakdownSchema = z.object({
  db_number: z.string().min(1, 'رقم DB للآلية مطلوب').max(30),
  fault_type: z.string().min(3, 'اكتب نوع العطل (3 أحرف فأكثر)').max(300),
  notes: z.string().max(1000).optional().or(z.literal('')),
})
export type BreakdownFormInput = z.infer<typeof breakdownSchema>

/** عقد إسناد المدير للشفت والقواطع (يُستخدم في إنشاء المستخدم) */
export const managerProfileSchema = z.object({
  shift: shiftEnum,
  sectors: z
    .array(z.coerce.number().int().min(1).max(8))
    .min(1, 'اختر قاطعاً واحداً على الأقل')
    .max(3, 'حد أقصى 3 قواطع'),
})
export type ManagerProfileFormInput = z.infer<typeof managerProfileSchema>
