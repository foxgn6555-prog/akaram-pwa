/**
 * Edge Function: adms-receiver — مستقبل أجهزة البصمة ZKTeco (بروتوكول ADMS Push v2.4.1)
 *
 * الجهاز هو من يتصل بنا (لا IP ثابت مطلوب):
 *   ① التسجيل:  GET  /iclock/cdata?SN={sn}&options=all&pushver=...
 *      ردنا:     GET OPTION FROM: {sn}\nATTLOGStamp=0\nOPERLOGStamp=0\nRealtime=1\n
 *                ServerVer=3.0.1\nDelay=5\nTransFlag=111111111111
 *   ② النبض:    GET  /iclock/getrequest?SN={sn}   →  "OK" (أو أمر من طابور الأوامر)
 *   ③ الدفع:    POST /iclock/cdata?SN={sn}&table=ATTLOG   (نص: PIN date time status verify)
 *   ④ التأكيد:  POST /iclock/devicecmd?SN={sn}&ID={n}     →  "OK"
 *
 * الأمان: SN يجب أن يكون مسجلاً ونشطاً — وإلا يُرفض ويُسجل.
 * التحول: biometric_ingest (00026) — يحوّل السطور لسجلات حضور حقيقية.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const path = url.pathname.replace(/\/functions\/v1\/adms-receiver\/?/, '/')
  const sn = url.searchParams.get('SN') ?? ''

  // ═══ ① التسجيل الأولي ═══
  if (req.method === 'GET' && path.startsWith('/iclock/cdata') && url.searchParams.get('options')) {
    const { error } = await admin.rpc('biometric_touch', { p_sn: sn })
    if (error) console.error('touch failed:', error.message)
    return admsResponse(
      `GET OPTION FROM: ${sn}\nATTLOGStamp=0\nOPERLOGStamp=0\nATTPHOTOStamp=0\n` +
      `ErrorDelay=30\nDelay=10\nTimeZone=-3\nRealtime=1\nEncrypt=0\nServerVer=3.0.1\n` +
      `TransFlag=111111111111\nPushProtVer=2.4.1\nSupportPing=1`,
    )
  }

  // ═══ ② نبض القلب ═══
  if (req.method === 'GET' && path.startsWith('/iclock/getrequest')) {
    await admin.rpc('biometric_touch', { p_sn: sn })
    // طابور الأوامر: مستقبلاً نقرأ device_commands ونعيد أمراً معلقاً
    return admsResponse('OK')
  }

  // ═══ ③ دفع بيانات (ATTLOG/OPERLOG/...) ═══
  if (req.method === 'POST' && path.startsWith('/iclock/cdata')) {
    const table = url.searchParams.get('table') ?? 'ATTLOG'
    const raw = await req.text()

    if (!sn) return admsResponse('ERROR')

    // التحويل عبر الدالة الآمنة (تتحقق من الجهاز وتسجل كل شيء)
    const { data: inserted, error } = await admin.rpc('biometric_ingest', {
      p_sn: sn,
      p_raw: raw,
      p_table: table,
    })

    if (error) {
      console.error('ingest error:', error.message)
      return admsResponse('ERROR')
    }

    // رد ADMS القياسي: عدد السجلات المستقبَلة (أو OK)
    return admsResponse(inserted !== null && inserted > 0 ? String(inserted) : 'OK')
  }

  // ═══ ④ تأكيد تنفيذ أمر ═══
  if (req.method === 'POST' && path.startsWith('/iclock/devicecmd')) {
    return admsResponse('OK')
  }

  return new Response('OK', { status: 200 })
})

function admsResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
