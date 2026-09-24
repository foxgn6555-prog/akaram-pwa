/**
 * بروتوكول ZKTeco ADMS (PUSH SDK) — منطق نقي قابل للاختبار.
 *
 * حقائق مثبتة من الوثائق/التجارب الميدانية:
 *  · TimeZone في رد الخيارات = إزاحة الجهاز عن UTC (مثال: -0500 لأمريكا الشرقية، 345 لنيبال +5:45).
 *    بغداد = +3 ⇒ «TimeZone=3». إرسال -3 يزيح كل الأوقات 6 ساعات.
 *  · بعض البرامج الثابتة تتجاهل السطر الأخير من رد الخيارات ⇒ TimeZone لا يكون آخر سطر أبداً.
 *  · سطر ATTLOG الحقيقي: PIN\tYYYY-MM-DD HH:MM:SS\tstatus\tverify\tworkcode\t… (محلي بلا منطقة).
 *  · OPERLOG: «USER PIN=1\tName=…\tPri=0\tCard=…» عند تسجيل/تعديل مستخدم.
 *  · رد الدفع القياسي: «OK».
 */

export interface AdmsOptionsInput {
  sn: string
  /** إزاحة الجهاز بتنسيق ±HH:MM (من biometric_devices.timezone_offset) */
  timezoneOffset?: string | null
  /** ختم آخر سجل حضور مستلَم (لاستئناف الإرسال) — 0 = من البداية */
  attlogStamp?: string | number
  operlogStamp?: string | number
}

/** «+03:00» → «3» · «-05:00» → «-5» · «+05:45» → «545» · «-03:30» → «-330» (صيغة ZK) */
export function toAdmsTimeZone(offset?: string | null): string {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec((offset ?? '').trim())
  if (!m) return '3' // بغداد افتراضياً
  const sign = m[1] === '-' ? '-' : ''
  const hh = String(Number(m[2]))
  const mm = m[3] ?? '00'
  return mm === '00' ? `${sign}${hh}` : `${sign}${hh}${mm}`
}

/** رد التسجيل الأولي (GET /iclock/cdata?options=all) — TimeZone ليس السطر الأخير */
export function buildOptionsResponse(i: AdmsOptionsInput): string {
  return [
    `GET OPTION FROM: ${i.sn}`,
    `ATTLOGStamp=${i.attlogStamp ?? 0}`,
    `OPERLOGStamp=${i.operlogStamp ?? 0}`,
    'ATTPHOTOStamp=0',
    'ErrorDelay=30',
    'Delay=10',
    `TimeZone=${toAdmsTimeZone(i.timezoneOffset)}`,
    'Realtime=1',
    'Encrypt=0',
    'ServerVer=3.0.1',
    'TransFlag=111111111111',
    'PushProtVer=2.4.1',
    'SupportPing=1',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
  ].join('\n') + '\n'
}

export interface AttlogLine {
  pin: string
  /** الوقت المحلي للجهاز كما ورد (بلا منطقة) */
  localTime: string
  status: number
  verify: number | null
  workcode: string | null
}

/** تحليل سطر ATTLOG (TAB أولاً، ثم المسافات للطرازات القديمة) — null للسطر المشوّه */
export function parseAttlogLine(line: string): AttlogLine | null {
  const t = line.trim()
  if (!t) return null
  let parts: string[]
  if (t.includes('\t')) {
    parts = t.split('\t')
  } else {
    const s = t.split(/\s+/)
    if (s.length < 3) return null
    parts = [s[0] ?? '', `${s[1]} ${s[2]}`, s[3] ?? '', s[4] ?? '', s[5] ?? '']
  }
  const pin = (parts[0] ?? '').trim()
  const localTime = (parts[1] ?? '').trim()
  if (!pin || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(localTime)) return null
  const status = Number.parseInt((parts[2] ?? '').trim(), 10)
  const verify = Number.parseInt((parts[3] ?? '').trim(), 10)
  const workcode = (parts[4] ?? '').trim()
  return {
    pin, localTime,
    status: Number.isFinite(status) ? status : 255,
    verify: Number.isFinite(verify) ? verify : null,
    workcode: workcode || null,
  }
}

/** ATTLOG كامل → أسطر صالحة + عدد المشوّه */
export function parseAttlog(raw: string): { lines: AttlogLine[]; malformed: number } {
  const lines: AttlogLine[] = []
  let malformed = 0
  for (const l of raw.split(/\r?\n/)) {
    if (!l.trim()) continue
    const p = parseAttlogLine(l)
    if (p) lines.push(p)
    else malformed++
  }
  return { lines, malformed }
}

export interface OperlogUser { pin: string; name: string | null; card: string | null; privilege: number | null }

/** «USER PIN=2\tName=Johny\tPri=0\tCard=…» → مستخدم؛ null لغير سجلات المستخدمين */
export function parseOperlogUser(line: string): OperlogUser | null {
  const body = line.trim().replace(/^(USER|OPLOG)\s+/i, '')
  if (!/(^|\t)PIN=/i.test(body)) return null
  const kv = new Map<string, string>()
  for (const seg of body.split('\t')) {
    const eq = seg.indexOf('=')
    if (eq <= 0) continue
    kv.set(seg.slice(0, eq).toUpperCase(), seg.slice(eq + 1))
  }
  const pin = (kv.get('PIN') ?? '').trim()
  if (!pin) return null
  const pri = Number.parseInt(kv.get('PRI') ?? '', 10)
  return {
    pin,
    name: (kv.get('NAME') ?? '').trim() || null,
    card: (kv.get('CARD') ?? '').trim() || null,
    privilege: Number.isFinite(pri) ? pri : null,
  }
}

/** ختم الاستئناف: آخر وقت محلي مستلَم بصيغة ZK (YYYY-MM-DD HH:MM:SS) أو 0 */
export function toStamp(lastLocalTime?: string | null): string {
  return lastLocalTime && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(lastLocalTime) ? lastLocalTime : '0'
}
