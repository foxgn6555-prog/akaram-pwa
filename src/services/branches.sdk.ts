/** SDK الفروع (00022) */
import { sdkGuard, sdkVoid, supabase } from './client'
import type { Branch, CreateBranchInput, UpdateBranchInput } from '@features/branches/types'

export type { Branch, CreateBranchInput, UpdateBranchInput }

export const branches = {
  async list(includeInactive = false): Promise<Branch[]> {
    let query = supabase
      .from('branches')
      .select('id, name, code, city, address, phone, is_active')
      .order('name')
    if (!includeInactive) query = query.eq('is_active', true)
    return sdkGuard(query) as Promise<Branch[]>
  },

  async create(input: CreateBranchInput): Promise<Branch> {
    return sdkGuard(
      supabase
        .from('branches')
        .insert({ ...input, code: input.code.toUpperCase() } as never)
        .select('id, name, code, city, address, phone, is_active')
        .single(),
    ) as Promise<Branch>
  },

  async update(id: string, input: UpdateBranchInput): Promise<void> {
    await sdkVoid(
      supabase.from('branches').update(input as never).eq('id', id),
    )
  },

  async setActive(id: string, is_active: boolean): Promise<void> {
    await sdkVoid(
      supabase.from('branches').update({ is_active } as never).eq('id', id),
    )
  },
}
