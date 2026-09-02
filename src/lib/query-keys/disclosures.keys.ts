/** مفاتيح استعلامات وحدة الكشوفات */
export const disclosuresKeys = {
  all: ['disclosures'] as const,
  list: () => [...disclosuresKeys.all, 'list'] as const,
  archived: () => [...disclosuresKeys.all, 'archived'] as const,
  summary: () => [...disclosuresKeys.all, 'summary'] as const,
  detail: (id: string) => [...disclosuresKeys.all, 'detail', id] as const,
}
