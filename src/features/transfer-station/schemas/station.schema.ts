/** Zod — عقود وحدات المحطة الجديدة: السكسات · النسافات (00043) */
import { z } from 'zod'

/** اسم سائق: حرفان فأكثر */
const driverName = (label: string) =>
  z.string().min(2, `${label} مطلوب (حرفان فأكثر)`).max(80, 'الاسم طويل جداً')

/** سجل خروج — السكسات/النسافات (وقت الخروج تلقائي — لا يُدخل يدوياً) */
export const outboundRecordSchema = z.object({
  driver_name: driverName('اسم السائق'),
  vehicle_type: z.string().max(50).optional().or(z.literal('')),
})

/** شهر الفولدر بصيغة YYYY-MM */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'الشهر بصيغة YYYY-MM')

export type OutboundFormInput = z.infer<typeof outboundRecordSchema>
