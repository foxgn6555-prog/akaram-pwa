/** mirror لـ 00004_departments.sql */
export interface Department {
  id: string
  name: string
  code: string
  parent_id: string | null
  is_active: boolean
}
