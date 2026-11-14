/** Read-only integration probes for direct table access; no counter RPC is invoked. */
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
  } catch { supabaseAvailable = false }
})

describe('أمن دخول الموظفين والدعم (قراءة مباشرة فقط)', () => {
  it.skipIf(!supabaseAvailable)('الجداول الحساسة لا تقبل قراءة anon مباشرة', async () => {
    const tables = ['login_source_locks', 'login_support_settings', 'login_support_requests', 'login_support_messages'] as const
    const results = await Promise.all(tables.map((table) => anon.from(table).select('*').limit(1)))
    for (const result of results) expect(result.error).toBeTruthy()
  })
})
