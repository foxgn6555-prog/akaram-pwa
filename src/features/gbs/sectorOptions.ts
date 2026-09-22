/** مناطق التشغيل الثماني ضمن القاطعين (عقد 00068) — خيارات حقول حاويات GBS */
export const GBS_PARENT_LABELS: Record<'karrada' | 'zaafaraniya', string> = {
  karrada: 'قاطع الكرادة',
  zaafaraniya: 'قاطع الزعفرانية',
}

export const GBS_SECTOR_OPTIONS: { id: number; name: string; parent: 'karrada' | 'zaafaraniya' }[] = [
  { id: 1, name: 'أرخيته', parent: 'karrada' },
  { id: 2, name: 'الرياض', parent: 'karrada' },
  { id: 3, name: 'الواثق', parent: 'karrada' },
  { id: 4, name: 'الجادرية', parent: 'karrada' },
  { id: 5, name: 'السندباد', parent: 'zaafaraniya' },
  { id: 6, name: 'الزعفرانية', parent: 'zaafaraniya' },
  { id: 7, name: 'ديالى', parent: 'zaafaraniya' },
  { id: 8, name: 'الوليد', parent: 'zaafaraniya' },
]
