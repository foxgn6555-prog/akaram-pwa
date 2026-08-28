/**
 * تكامل: إقفال الدخول على الخادم — 5 محاولات فاشلة → is_login_locked = true
 * يتطلب Supabase محلياً (npm run db:reset). إن لم يكن متاحاً → يتخطى بلا فشل.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL ?? 'http://localhost:54321'
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const TEST_EMAIL = `lock-test-${Date.now()}@integration.invalid`

let supabaseAvailable = false
const anon = createClient(URL, ANON || 'x', { auth: { persistSession: false } })
const admin = SERVICE ? createClient(URL, SERVICE, { auth: { persistSession: false } }) : null

beforeAll(async () => {
  try {
    const res = await fetch(`${URL}/rest/v1/`, { headers: { apikey: ANON || 'x' } })
    supabaseAvailable = res.ok || res.status === 401
  } catch {
    supabaseAvailable = false
  }
})

afterAll(async () => {
  if (!supabaseAvailable || !admin) return
  await admin.from('login_attempts').delete().eq('email', TEST_EMAIL)
})

describe('أمن الدخول على الخادم (migration 00016)', () => {
  it.skipIf(!supabaseAvailable)('4 محاولات فاشلة → غير مقفل', async () => {
    for (let i = 0; i < 4; i++) {
      await anon.rpc('record_login_attempt', { p_email: TEST_EMAIL, p_success: false })
    }
    const { data: locked } = await anon.rpc('is_login_locked', { p_email: TEST_EMAIL })
    expect(locked).toBe(false)
  })

  it.skipIf(!supabaseAvailable)('المحاولة الخامسة → مقفل', async () => {
    await anon.rpc('record_login_attempt', { p_email: TEST_EMAIL, p_success: false })
    const { data: locked } = await anon.rpc('is_login_locked', { p_email: TEST_EMAIL })
    expect(locked).toBe(true)
  })

  it.skipIf(!supabaseAvailable)('النجاح يمحو العداد → غير مقفل', async () => {
    await anon.rpc('record_login_attempt', { p_email: TEST_EMAIL, p_success: true })
    const { data: locked } = await anon.rpc('is_login_locked', { p_email: TEST_EMAIL })
    expect(locked).toBe(false)
  })

  it.skipIf(!supabaseAvailable)('لا يمكن قراءة login_attempts مباشرة (RLS بلا سياسات)', async () => {
    const { data, error } = await anon.from('login_attempts').select('*')
    expect(error ?? null).toBeTruthy()
    expect(data ?? []).toHaveLength(0)
  })
})
