/**
 * تكامل: دوال البوابة التقنية على الخادم الحقيقي (00018)
 * يعمل محلياً عند توفر Supabase؛ يتخطى ذاتياً في CI بدون قاعدة.
 * المبدأ: anon (بلا دور) يُرفض أو يرى فراغاً — لا تسريب إطلاقاً.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL ?? 'http://localhost:54321'
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? ''

let supabaseAvailable = false
const anon = createClient(URL, ANON || 'x', { auth: { persistSession: false } })

beforeAll(async () => {
  try {
    const res = await fetch(`${URL}/rest/v1/`, { headers: { apikey: ANON || 'x' } })
    supabaseAvailable = res.ok || res.status === 401
  } catch {
    supabaseAvailable = false
  }
})

describe('أمن RPCs البوابة التقنية (00018)', () => {
  it.skipIf(!supabaseAvailable)('anon: list_platform_users يُرفض', async () => {
    const { error } = await anon.rpc('list_platform_users', { p_query: null })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('USERS_FORBIDDEN')
  })

  it.skipIf(!supabaseAvailable)('anon: set_user_role يُرفض', async () => {
    const { error } = await anon.rpc('set_user_role', {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_role: 'employee',
      p_grant: true,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('USERS_FORBIDDEN')
  })

  it.skipIf(!supabaseAvailable)('anon: db_stats يرد مصفوفة فارغة (بلا تسريب)', async () => {
    const { data } = await anon.rpc('db_stats')
    expect(data).toEqual([])
  })

  it.skipIf(!supabaseAvailable)('anon: db_overview يرد allowed=false فقط', async () => {
    const { data } = await anon.rpc('db_overview')
    expect(data).toMatchObject({ allowed: false })
  })

  it.skipIf(!supabaseAvailable)('anon: set_user_role بدور مزيف يُرفض (فحص الدور أولاً)', async () => {
    const { error } = await anon.rpc('set_user_role', {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_role: 'not_a_role',
      p_grant: true,
    })
    expect(error).not.toBeNull()
  })

  it.skipIf(!supabaseAvailable)('anon: لا يقرأ app_errors إطلاقاً', async () => {
    const { data, error } = await anon.from('app_errors').select('*')
    expect(error ?? null).toBeTruthy()
    expect(data ?? []).toHaveLength(0)
  })
})
