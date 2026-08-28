/** SDK الأقسام — قائمة مرجعية (يستهلكها إنشاء المستخدم و HR) */
import { sdkGuard, supabase } from './client'
import type { Department } from '@features/departments/types'

export interface CreateDepartmentInput {
  name: string
  code: string
  parent_id?: string | null
}

export const departments = {
  async create(input: CreateDepartmentInput): Promise<Department> {
    return sdkGuard(
      supabase
        .from('departments')
        .insert({
          name: input.name,
          code: input.code.toUpperCase(),
          parent_id: input.parent_id ?? null,
        } as never)
        .select('id, name, code, parent_id, is_active')
        .single(),
    ) as Promise<Department>
  },

  async list(): Promise<Department[]> {
    return sdkGuard(
      supabase
        .from('departments')
        .select('id, name, code, parent_id, is_active')
        .eq('is_active', true)
        .order('name'),
    ) as Promise<Department[]>
  },
}
