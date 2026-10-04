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
import { buildOptionsResponse, normalizeAdmsPath, toStamp } from '../_shared/adms-protocol.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  // داخل Supabase يصل المسار كـ /adms-receiver/iclock/... (بلا /functions/v1) — كان التطبيع القديم يفشل فيُرد "OK" عاماً ولا يُسجَّل الجهاز أبداً
  const path = normalizeAdmsPath(url.pathname)
  const sn = url.searchParams.get('SN') ?? ''

  // ═══ ① التسجيل الأولي ═══
  if (req.method === 'GET' && path.startsWith('/iclock/cdata') && url.searchParams.get('options')) {
    const { error } = await admin.rpc('biometric_touch', { p_sn: sn })
    if (error) console.error('touch failed:', error.message)
    // منطقة الجهاز من تسجيله (00140) — TimeZone الخاطئ يزيح كل الأوقات
    const { data: dev } = await admin
      .from('biometric_devices').select('timezone_offset').eq('serial_number', sn).maybeSingle()
    // استئناف من آخر بصمة مستلَمة (00167) — بدل ATTLOGStamp=0 الذي يجعل الجهاز يعيد إرسال ذاكرته كلها عند كل تسجيل
    const { data: last } = await admin.rpc('biometric_last_stamp', { p_sn: sn })
    return admsResponse(buildOptionsResponse({
      sn, timezoneOffset: dev?.timezone_offset ?? '+03:00', attlogStamp: toStamp(typeof last === 'string' ? last : null),
    }))
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

    // رد ADMS القياسي «OK» (رقم مجرد غير قياسي وقد يُعاد إرسال الدفعة)
    console.log(`adms ${table} sn=${sn} converted=${inserted ?? 0}`)
    return admsResponse('OK')
  }

  // ═══ ④ تأكيد تنفيذ أمر ═══
  if (req.method === 'POST' && path.startsWith('/iclock/devicecmd')) {
    return admsResponse('OK')
  }

  console.warn('adms: unhandled', req.method, path, sn)
  return new Response('OK', { status: 200 })
})

function admsResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
