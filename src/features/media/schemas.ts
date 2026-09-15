/**
 * مخططات بوابة الإعلام — تحقق نموذج الإرسال والتصميم
 */
import { z } from 'zod'
import {
  CUSTOM_WORK_TYPE,
  MAX_PHOTOS,
  type MediaMode,
  type PeriodType,
  workTypesForMode,
} from './constants'

export const mediaModeSchema = z.enum(['street', 'campaign', 'school'])

export const sendFormSchema = (mode: MediaMode) =>
  z.object({
    title: z
      .string()
      .trim()
      .min(2, 'الاسم قصير جداً (حرفان على الأقل)')
      .max(200, 'الاسم طويل جداً'),
    work_type: z
      .string()
      .trim()
      .refine((value) => {
        if (mode === 'street') return true // اختياري لصور الشارع
        if (value === CUSTOM_WORK_TYPE) return true
        return workTypesForMode(mode).includes(value) || value.length >= 2
      }, 'اختر نوع العمل')
      .optional()
      .or(z.literal('')),
    custom_type: z
      .string()
      .trim()
      .max(100)
      .refine((value) => value.length >= 2, 'نوع العمل المخصص قصير جداً')
      .optional()
      .or(z.literal('')),
    notes: z.string().trim().max(1000, 'الملاحظات طويلة جداً').optional().or(z.literal('')),
    photo_count: z.number().int().min(1, 'أضف صورة واحدة على الأقل').max(MAX_PHOTOS, `حد أقصى ${MAX_PHOTOS} صورة`),
  })

export type SendFormInput = z.infer<ReturnType<typeof sendFormSchema>>

/** قيمة نوع العمل الفاعلة (بعد ضم المخصص) */
export function effectiveWorkType(workType: string, customType: string, mode: MediaMode): string | null {
  const raw = mode === 'street' ? '' : workType
  if (raw === CUSTOM_WORK_TYPE) return customType.trim() || null
  const value = raw.trim()
  if (!value) return null
  return value
}

export const designTitleSchema = z
  .string()
  .trim()
  .min(2, 'العنوان قصير جداً')
  .max(300, 'العنوان طويل جداً')

export const periodTypeSchema = z.enum(['first_half', 'second_half', 'monthly'])
export type { PeriodType }
