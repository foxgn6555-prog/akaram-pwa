/** mirror لـ 00022_branches.sql */
export interface Branch {
  id: string
  name: string
  code: string
  city: string | null
  address: string | null
  phone: string | null
  is_active: boolean
}

export interface CreateBranchInput {
  name: string
  code: string
  city?: string
  address?: string
  phone?: string
}

export type UpdateBranchInput = Partial<CreateBranchInput> & { is_active?: boolean }
