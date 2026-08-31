/**
 * Edge Function: admin-users — عمليات إدارة المستخدمين (وحدة إدارة المستخدمين)
 * الأكشنات (body.action):
 *  · create         (افتراضي) — إنشاء حساب + دور + ربط موظف
 *  · update_email   — تغيير بريد حساب قائم (منع الذات)
 *  · set_ban        — تعطيل/تفعيل حساب (منع الذات)
 *  · reset_password — إعادة تعيين كلمة مرور (يُسمح للذات)
 * الأمان:
 *  1) JWT إلزامي من المتصل (supabase.functions.invoke يرسله)
 *  2) التحقق من دور المتصل: it_admin / super_admin / hr_officer (مصدره user_roles وليس JWT)
 *  3) service_role مستخدم داخل الدالة فقط — لا يلمسه العميل أبداً
 *  4) تدقيق: كل عملية تُسجَّل في audit_logs
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

/* mirror لـ ASSIGNABLE_ROLES في src/features/user-management/types.ts */
const VALID_ROLES = [
  'employee', 'hr_officer', 'department_manager', 'finance_officer',
  'it_admin', 'super_admin', 'field_ops', 'admin_ops', 'maintenance',
  'transfer_station', 'executive_director', 'deputy_director', 'ops_room',
]
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/* ~100 سنة — للتعطيل الدائم عبر ban_duration */
const PERMANENT_BAN = '876000h'

type AdminClient = ReturnType<typeof createClient>
type Body = Record<string, unknown>

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'NO_AUTH' }, 401)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

    // ① من هو المتصل؟
    const { data: callerData, error: callerError } = await admin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (callerError || !callerData.user) return json({ error: 'INVALID_CALLER' }, 401)
    const callerId = callerData.user.id

    // ② هل يملك دوراً مصرحاً؟
    const { data: roleRows } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
    const callerRoles: string[] = (roleRows ?? []).map((r: { role: string }) => r.role)
    if (!callerRoles.some((r) => ['it_admin', 'super_admin', 'hr_officer'].includes(r))) {
      return json({ error: 'FORBIDDEN' }, 403)
    }

    // ③ التوجيه حسب الأكشن
    const body: Body = await req.json()
    const action = String(body.action ?? 'create')

    if (action === 'create') return await createUser(admin, callerId, body)
    if (action === 'update_email') return await updateEmail(admin, callerId, body)
    if (action === 'set_ban') return await setBan(admin, callerId, body)
    if (action === 'reset_password') return await resetPassword(admin, callerId, body)
    return json({ error: 'BAD_ACTION' }, 400)
  } catch {
    return json({ error: 'INTERNAL' }, 500)
  }
})

/** تدقيق موحّد لكل عمليات auth (الجداول الحساسة) */
async function audit(
  admin: AdminClient,
  actorId: string,
  action: string,
  targetUserId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await admin.from('audit_logs').insert({
    table_name: 'auth_users',
    record_id: targetUserId,
    operation: 'UPDATE',
    new_row: { action, ...detail },
    actor_id: actorId,
    actor_role: 'edge:admin-users',
  })
}

/**
 * create — إنشاء حساب جديد: auth + دور + ربط موظف
 * (نفس العقد السابق — backward compatible، مع قائمة أدوار كاملة)
 */
async function createUser(admin: AdminClient, callerId: string, body: Body): Promise<Response> {
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const role = String(body.role ?? '')
  const fullName = String(body.full_name ?? '').trim()
  const employeeNumber = String(body.employee_number ?? '').trim()
  const departmentId = body.department_id ? String(body.department_id) : null
  const jobTitle = body.job_title ? String(body.job_title).trim() : null

  if (!EMAIL_RE.test(email)) return json({ error: 'BAD_EMAIL' }, 400)
  if (password.length < 8) return json({ error: 'WEAK_PASSWORD' }, 400)
  if (!VALID_ROLES.includes(role)) return json({ error: 'BAD_ROLE' }, 400)
  if (!fullName) return json({ error: 'NAME_REQUIRED' }, 400)

  // منع تكرار الرقم الوظيفي
  if (employeeNumber) {
    const { data: dupEmployee } = await admin
      .from('employees')
      .select('id')
      .eq('employee_number', employeeNumber)
      .maybeSingle()
    if (dupEmployee) return json({ error: 'EMPLOYEE_NUMBER_TAKEN' }, 409)
  }

  // إنشاء مستخدم auth
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (createError || !created.user) {
    const code = (createError?.message ?? '').includes('already')
      ? 'EMAIL_TAKEN'
      : 'CREATE_FAILED'
    return json({ error: code, detail: createError?.message }, 409)
  }
  const userId = created.user.id

  // تعيين الدور (يمر عبر RPC ليُدقَّن في audit_logs)
  const { error: roleError } = await admin.rpc('set_user_role', {
    p_user_id: userId,
    p_role: role,
    p_grant: true,
  })
  if (roleError) {
    // تراجع نظيف: لا نترك مستخدماً بلا دور
    await admin.auth.admin.deleteUser(userId)
    return json({ error: 'ROLE_ASSIGN_FAILED', detail: roleError.message }, 500)
  }

  // ربط سجل موظف (اختياري لكنه المعتاد)
  if (employeeNumber) {
    const { error: empError } = await admin.from('employees').insert({
      user_id: userId,
      employee_number: employeeNumber,
      full_name: fullName,
      department_id: departmentId,
      job_title: jobTitle,
    })
    if (empError) {
      return json({ error: 'EMPLOYEE_LINK_FAILED', user_id: userId, detail: empError.message }, 207)
    }
  }

  await audit(admin, callerId, 'create', userId, { email, role })
  return json({ user_id: userId, email, role }, 200)
}

/** update_email — تغيير بريد حساب قائم (الذات ممنوع — له مساره الخاص) */
async function updateEmail(admin: AdminClient, callerId: string, body: Body): Promise<Response> {
  const userId = String(body.user_id ?? '')
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!userId) return json({ error: 'USER_REQUIRED' }, 400)
  if (!EMAIL_RE.test(email)) return json({ error: 'BAD_EMAIL' }, 400)
  if (userId === callerId) return json({ error: 'SELF_FORBIDDEN' }, 403)

  const { error } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  })
  if (error) {
    const code = error.message.includes('already been registered') || error.message.includes('already')
      ? 'EMAIL_TAKEN'
      : 'UPDATE_FAILED'
    return json({ error: code, detail: error.message }, 409)
  }

  await audit(admin, callerId, 'update_email', userId, { email })
  return json({ ok: true, email }, 200)
}

/** set_ban — تعطيل/تفعيل حساب (الذات ممنوع — منع قفل النظام) */
async function setBan(admin: AdminClient, callerId: string, body: Body): Promise<Response> {
  const userId = String(body.user_id ?? '')
  const banned = body.banned === true
  if (!userId) return json({ error: 'USER_REQUIRED' }, 400)
  if (userId === callerId) return json({ error: 'SELF_FORBIDDEN' }, 403)

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? PERMANENT_BAN : 'none',
  })
  if (error) return json({ error: 'BAN_FAILED', detail: error.message }, 500)

  await audit(admin, callerId, banned ? 'ban' : 'unban', userId, { banned })
  return json({ ok: true, banned }, 200)
}

/** reset_password — إعادة تعيين كلمة مرور (نفس سياسة القوة) */
async function resetPassword(admin: AdminClient, callerId: string, body: Body): Promise<Response> {
  const userId = String(body.user_id ?? '')
  const password = String(body.password ?? '')
  if (!userId) return json({ error: 'USER_REQUIRED' }, 400)
  if (
    password.length < 8 ||
    !/[A-Za-z\u0600-\u06FF]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    return json({ error: 'WEAK_PASSWORD' }, 400)
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return json({ error: 'RESET_FAILED', detail: error.message }, 500)

  await audit(admin, callerId, 'reset_password', userId, {})
  return json({ ok: true }, 200)
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

