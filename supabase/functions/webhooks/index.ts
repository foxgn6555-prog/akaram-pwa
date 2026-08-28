/**
 * Edge Function: webhooks — نقطة الاستقبال الوحيدة للـ webhooks الخارجية.
 * الأمان: تحقق HMAC-SHA256 إلزامي قبل أي معالجة (انظر _shared/hmac.ts).
 * النشر: supabase functions deploy webhooks --no-verify-jwt (المصادقة عبر التوقيع)
 */
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'

Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const signature = req.headers.get('x-webhook-signature')
    const rawBody = await req.text()

    if (!signature || !(await verifyHmacSignature(rawBody, signature))) {
      return new Response(JSON.stringify({ error: 'INVALID_SIGNATURE' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = JSON.parse(rawBody)

    // TODO(v4): التوجيه حسب نوع الـ webhook (event.type) — أضف المعالجات هنا
    console.log('[webhook] received:', payload.type ?? 'unknown')

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'BAD_REQUEST' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
