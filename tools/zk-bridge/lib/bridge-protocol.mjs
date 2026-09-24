/* نسخة ESM للوكيل (Node بلا TypeScript) من supabase/functions/_shared/bridge-protocol.ts — أي تعديل هناك يجب أن ينعكس هنا؛ اختبار bridge-protocol.test.ts يثبت تطابق السلوك */
/**
 * عقد جسر الشبكة الداخلية (zk_bridge) — مشترك بين وكيل tools/zk-bridge وEdge biometric-bridge.
 *
 *   POST /functions/v1/biometric-bridge
 *   Headers: X-Device-Serial, X-Bridge-Key  (مفتاح لكل جهاز يولَّد من بوابة التطوير المركزية)
 *   Body   : { punches: BridgePunch[], users?: BridgeUser[], error?: string, agent?: string }
 *
 *   الوقت: الوكيل يرسل وقت الجهاز المحلي كما هو (local: 'YYYY-MM-DD HH:mm:ss') ويحوّله الخادم
 *   بمنطقة الجهاز المسجلة — لا يُعتمد على منطقة جهاز الحاسوب الذي يشغّل الوكيل.
 */

export const BRIDGE_MAX_PUNCHES = 5000
export const BRIDGE_MAX_USERS = 5000

const PIN_RE = /^[A-Za-z0-9._-]{1,32}$/
const LOCAL_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

export class BridgeValidationError extends Error { constructor(code, msg) { super(msg ? `${code}: ${msg}` : code); this.code = code } }

/** تحقق صارم من الحمولة قبل لمس قاعدة البيانات. */
export function validateBridgeBody(raw) {
  if (!raw || typeof raw !== 'object') throw new BridgeValidationError('BRIDGE_BODY_INVALID')
  const b = raw
  const error = typeof b.error === 'string' && b.error.trim() ? b.error.trim().slice(0, 500) : undefined
  const punchesIn = Array.isArray(b.punches) ? b.punches : (error ? [] : null)
  if (!punchesIn) throw new BridgeValidationError('BRIDGE_PUNCHES_MISSING')
  if (punchesIn.length > BRIDGE_MAX_PUNCHES) throw new BridgeValidationError('BRIDGE_TOO_MANY', `max ${BRIDGE_MAX_PUNCHES}`)
  const punches = punchesIn.map((p, i) => {
    const r = p ?? {}
    const pin = String(r.pin ?? '').trim()
    const local = String(r.local ?? '').trim()
    if (!PIN_RE.test(pin)) throw new BridgeValidationError('BRIDGE_PIN_INVALID', `punch #${i}`)
    if (!LOCAL_RE.test(local)) throw new BridgeValidationError('BRIDGE_TIME_INVALID', `punch #${i}: ${local}`)
    const d = r.direction === 'in' || r.direction === 'out' ? r.direction : 'unknown'
    return { pin, local, direction: d }
  })
  const usersIn = Array.isArray(b.users) ? b.users : []
  if (usersIn.length > BRIDGE_MAX_USERS) throw new BridgeValidationError('BRIDGE_TOO_MANY', `max users ${BRIDGE_MAX_USERS}`)
  const users = usersIn.flatMap((u) => {
    const r = u ?? {}
    const pin = String(r.pin ?? '').trim()
    if (!PIN_RE.test(pin)) return []
    const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 120) : undefined
    const card = r.card != null && String(r.card).trim() && String(r.card) !== '0' ? String(r.card).trim().slice(0, 40) : undefined
    const privilege = r.privilege != null && /^\d+$/.test(String(r.privilege)) ? Number(r.privilege) : undefined
    return [{ pin, name, card, privilege }]
  })
  const agent = typeof b.agent === 'string' ? b.agent.slice(0, 60) : undefined
  return { punches, users, error, agent }
}

/** صياغة وقت الجهاز المحلي من كائن Date الذي تُرجعه مكتبات ZK (تفكّ الحقول كأنها بالتوقيت المحلي للحاسوب). */
export function deviceLocalString(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** سجل حضور كما تعيده node-zklib: { userSn, deviceUserId, recordTime, ip } → BridgePunch */
export function mapZkAttendance(rec) {
  const pin = String(rec.deviceUserId ?? '').trim()
  const t = rec.recordTime instanceof Date ? rec.recordTime : (rec.recordTime ? new Date(String(rec.recordTime)) : null)
  if (!PIN_RE.test(pin) || !t || Number.isNaN(t.getTime()) || t.getFullYear() < 2000) return null
  return { pin, local: deviceLocalString(t), direction: 'unknown', uid: rec.userSn }
}

/** مستخدم كما تعيده node-zklib: { uid, role, name, cardno, userId } → BridgeUser */
export function mapZkUser(u) {
  const pin = String(u.userId ?? '').trim()
  if (!PIN_RE.test(pin)) return null
  return {
    pin,
    name: typeof u.name === 'string' && u.name.trim() ? u.name.trim() : undefined,
    card: u.cardno != null && Number(u.cardno) !== 0 ? String(u.cardno) : undefined,
    privilege: u.role != null && /^\d+$/.test(String(u.role)) ? Number(u.role) : undefined,
  }
}

/** ترشيح تزايدي: أرسل فقط ما بعد آخر وقت مُرسل (مع هامش يوم لتغطية سجلات وصلت متأخرة؛ الخادم يزيل التكرار). */
export function sinceFilter(punches, lastLocal, marginHours = 24) {
  if (!lastLocal || !LOCAL_RE.test(lastLocal)) return punches
  const cutoff = new Date(lastLocal.replace(' ', 'T') + 'Z').getTime() - marginHours * 3600_000
  return punches.filter((p) => new Date(p.local.replace(' ', 'T') + 'Z').getTime() >= cutoff)
}

export function maxLocal(punches) {
  return punches.reduce((m, p) => (m == null || p.local > m ? p.local : m), null)
}
