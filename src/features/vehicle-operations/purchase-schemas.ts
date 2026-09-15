/**
 * مخططات وتسميات مشتركة لوحدة المشتريات والمراحل — بوابة الصيانة
 */
import { z } from 'zod'

/** أقسام المخزون الأربعة + أخرى */
export const PART_CATEGORIES = [
  { value: 'mechanical', label: 'ميكانيك' },
  { value: 'electrical', label: 'كهرباء' },
  { value: 'bodywork', label: 'سمكرة' },
  { value: 'metalwork', label: 'حدادة' },
  { value: 'other', label: 'أخرى' },
] as const

export type PartCategoryValue = (typeof PART_CATEGORIES)[number]['value']

export const partCategoryLabel = (value: string): string =>
  PART_CATEGORIES.find((c) => c.value === value)?.label ?? value

/** المراحل الخمس لصيانة الآلية (بالترتيب) */
export const MAINTENANCE_STAGES = [
  { no: 1, key: 'arrival', label: 'الاستلام والتسليم المبدئي', hint: 'تأكيد وصول الآلية إلى الصيانة' },
  { no: 2, key: 'diagnosis', label: 'تشخيص العطل', hint: 'كتابة تشخيص العطل قبل بدء أي إصلاح' },
  { no: 3, key: 'repair', label: 'الإصلاح وبانتظار القطع', hint: 'تنفيذ الأعمال وصرف وتركيب قطع الغيار' },
  { no: 4, key: 'inspection', label: 'الفحص واعتماد الجاهزية', hint: 'الفحص النهائي ثم اعتماد الجاهزية للمغادرة' },
  { no: 5, key: 'handover', label: 'تسليم الآلية', hint: 'إرسال الآلية إلى موقع العمل أو الكراج' },
] as const

export const stageLabel = (key: string | null): string =>
  MAINTENANCE_STAGES.find((s) => s.key === key)?.label ?? ''

export const purchaseItemSchema = z.object({
  part_category: z.enum(['mechanical', 'electrical', 'bodywork', 'metalwork', 'other']),
  item_name: z.string().trim().min(2, 'اسم الصنف قصير جداً').max(200),
  quantity: z.number({ message: 'أدخل كمية صحيحة' }).positive('الكمية يجب أن تكون أكبر من صفر'),
  unit: z.string().trim().min(1).max(20),
  unit_price: z
    .number({ message: 'أدخل سعر الوحدة' })
    .min(0, 'السعر لا يمكن أن يكون سالباً'),
})

export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>

export const purchaseOrderSchema = z.object({
  supplier_name: z.string().trim().max(200).optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  items: z
    .array(purchaseItemSchema)
    .min(1, 'أضف صنفاً واحداً على الأقل')
    .max(50, 'حدّ أقصى 50 صنفاً في الأمر'),
})

export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>

/** إجمالي أمر شراء محلياً (يُعاد احتسابه خادماً) */
export function purchaseLineTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100
}

export function purchaseOrderTotal(items: Array<{ quantity: number; unit_price: number }>): number {
  return Math.round(items.reduce((sum, item) => sum + purchaseLineTotal(item.quantity, item.unit_price), 0) * 100) / 100
}

/** تنسيق المبالغ بالدينار العراقي */
export const money = (value: number): string => new Intl.NumberFormat('ar-IQ').format(value)
