/**
 * الحمولة القياسية للشحنة الخارجة — مرآة TS لجدول ts_unit_capacities (ميجريشن 00131):
 *  · السكسات الخارجة: 10 طن للشحنة
 *  · النسافات الخارجة: 25 طن للشحنة
 *  · ناقلة الحاويات المكبسية: 16 طن للشحنة
 * تُستخدم قيمة افتراضية في النماذج ولحساب الأطنان عند غياب وزن مسجل.
 */
export type OutboundUnit = 'saksat' | 'trips' | 'carrier'

export const UNIT_CAPACITIES: Record<OutboundUnit, { label: string; tons: number }> = {
  saksat: { label: 'السكسات الخارجة', tons: 10 },
  trips: { label: 'النسافات الخارجة', tons: 25 },
  carrier: { label: 'ناقلة حاويات مكبسية', tons: 16 },
}

export const unitCapacity = (unit: OutboundUnit): number => UNIT_CAPACITIES[unit].tons
