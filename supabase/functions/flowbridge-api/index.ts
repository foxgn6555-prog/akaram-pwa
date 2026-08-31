/**
 * Edge Function: flowbridge-api — عقد REST الحقيقي لمصمم التدفقات (FlowBridge)
 * يخدم العقد الموثّق في public/flowbridge/INTEGRATION.md:
 *   GET/PUT /workflows/portals   → Portal[]
 *   GET/PUT /workflows/graph     → { nodes, flows }
 *   GET/PUT /workflows/settings  → { autosave, apiUrl, apiToken, categories[] }
 *
 * الأمان (بلا service_role إطلاقاً — الحاكم الحقيقي هو RLS):
 *   1) JWT المتصل يُمرَّر كما هو إلى عميل Supabase (Authorization forward)
 *      فتُطبَّق سياسات public.flowbridge_state (it_admin/super_admin) حرفياً.
 *   2) لا حاجة لفحص دور يدوي هنا — الرفض يأتي طبيعياً من postgres (RLS 403/كائن فارغ).
 *   3) حد حجم الحمولة (2MB) لمنع إساءة الاستخدام.
 * النشر: supabase functions deploy flowbridge-api
 *   (verify_jwt الافتراضي مفعّل — بوابة Supabase ترفض أي طلب بلا JWT صالح
 *    قبل وصوله للدالة أصلاً؛ RLS داخل flowbridge_state هو طبقة التخويل الثانية)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const MAX_BODY_BYTES = 2 * 1024 * 1024 // 2MB — مخطط تدفقات كبير جداً يبقى ضمنه بارتياح

const VALID_KEYS = new Set(['portals', 'graph', 'settings'])

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const url = new URL(req.url)
  // يعمل خلف /functions/v1/flowbridge-api/workflows/{key} وأيضاً محلياً بلا البادئة
  const match = url.pathname.match(/\/workflows\/([a-z]+)\/?$/)
  if (!match) return json({ error: 'NOT_FOUND' }, 404)

  const key = match[1]
  if (!VALID_KEYS.has(key)) return json({ error: 'BAD_KEY' }, 404)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'NO_AUTH' }, 401)

  // عميل بهوية المتصل نفسه — RLS هو الحكم الوحيد (لا service_role هنا إطلاقاً)
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  })

  try {
    if (req.method === 'GET') return await handleGet(client, key)
    if (req.method === 'PUT') return await handlePut(client, key, req)
    return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  } catch (err) {
    console.error('[flowbridge-api] unexpected error:', err)
    return json({ error: 'INTERNAL' }, 500)
  }
})

async function handleGet(
  client: ReturnType<typeof createClient>,
  key: string,
): Promise<Response> {
  const { data, error } = await client
    .from('flowbridge_state')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  if (error) {
    // RLS يرفض المستخدمين غير المخوّلين — نُعيد قيمة فارغة آمنة بدل كشف تفاصيل الخطأ
    console.warn('[flowbridge-api] GET rejected/failed:', error.message)
    return json({ error: 'FORBIDDEN_OR_MISSING' }, 403)
  }
  if (!data) return json(key === 'portals' ? [] : {}, 200)

  // القيمة تُعاد كما خُزّنت حرفياً: مصفوفة للبوابات، كائن للمخطط/الإعدادات
  return json(data.value, 200)
}

async function handlePut(
  client: ReturnType<typeof createClient>,
  key: string,
  req: Request,
): Promise<Response> {
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'PAYLOAD_TOO_LARGE' }, 413)

  let value: unknown
  try {
    value = await req.json()
  } catch {
    return json({ error: 'BAD_JSON' }, 400)
  }

  // تحقق شكلي بسيط يطابق العقد الموثق — حماية إضافية قبل RLS
  if (key === 'portals' && !Array.isArray(value)) return json({ error: 'PORTALS_MUST_BE_ARRAY' }, 400)
  if (key === 'graph' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    return json({ error: 'GRAPH_MUST_BE_OBJECT' }, 400)
  }
  if (key === 'settings' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    return json({ error: 'SETTINGS_MUST_BE_OBJECT' }, 400)
  }

  const { data: userData } = await client.auth.getUser()
  const userId = userData.user?.id ?? null

  const { error } = await client
    .from('flowbridge_state')
    .upsert({ key, value, updated_by: userId }, { onConflict: 'key' })

  if (error) {
    console.warn('[flowbridge-api] PUT rejected/failed:', error.message)
    return json({ error: 'FORBIDDEN_OR_SAVE_FAILED', detail: error.message }, 403)
  }

  return json({ ok: true }, 200)
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
