/** Zod — عقد إدخال سجل الوزن (دفتر المحطة التحويلية) */
import { z } from 'zod'

/** رقم آلي/لوحة: أرقام وحروف عربية/إنجليزية ومسافة وشرطة */
const dbNumber = z
  .string({ error: 'رقم الآلية (DB) مطلوب' })
  .min(1, 'رقم الآلية (DB) مطلوب')
  .max(30, 'الرقم طويل جداً')

/** وزن موجب اختياري (يسمح بإدخال لاحق) */
const weight = z
  .union([
    z.coerce.number().positive('الوزن يجب أن يكون أكبر من صفر'),
    z.literal(''),
    z.null(),
    z.undefined(),
  ])
  .optional()

/** وقت الدخول HH:mm (اختياري) */
const entryTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'الوقت بصيغة ساعة:دقيقة')
  .optional()
  .or(z.literal(''))

export const weightRecordSchema = z
  .object({
    db_number: dbNumber,
    driver_name: z.string().min(2, 'اسم السائق مطلوب (حرفان فأكثر)').max(80),
    vehicle_type: z.string().max(50).optional().or(z.literal('')),
    gross_weight: weight,
    tare_weight: weight,
    entry_time: entryTime,
    log_date: z.string().min(1, 'التاريخ مطلوب'),
    shift: z.enum(['morning', 'evening'], { message: 'اختر الشفت' }),
  })
  // الصافي = الكلي − الفارغ يجب ألا يكون سالباً إن توفّر الاثنان
  .refine(
    (v) =>
      v.gross_weight === '' ||
      v.gross_weight == null ||
      v.tare_weight === '' ||
      v.tare_weight == null ||
      (Number(v.gross_weight) >= Number(v.tare_weight)),
    { message: 'الوزن الفارغ لا يتجاوز الوزن الكلي (الصافي لا يكون سالباً)', path: ['tare_weight'] },
  )

export type WeightFormInput = z.infer<typeof weightRecordSchema>

/** عقد سبب الأرشفة (الحذف → أرشيف IT) */
export const archiveReasonSchema = z.object({
  reason: z
    .string()
    .min(5, 'اذكر سبب الحذف بوضوح (5 أحرف فأكثر)')
    .max(500, 'السبب طويل جداً'),
})
export type ArchiveReasonInput = z.infer<typeof archiveReasonSchema>
