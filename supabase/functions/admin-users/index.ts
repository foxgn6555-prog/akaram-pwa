/**
 * Edge Function: admin-users — إنشاء مستخدم منصة جديد (وحدة إدارة المستخدمين)
 * الأمان:
 *  1) JWT إلزامي من المتصل (supabase.functions.invoke يرسله)
 *  2) التحقق من دور المتصل: it_admin / super_admin / hr_officer (مصدره user_roles وليس JWT)
 *  3) service_role مستخدم داخل الدالة فقط — لا يلمسه العميل أبداً
 *  4) تدقيق: إنشاء الدور يتم عبر app.set_user_role (يسجل في audit_logs تلقائياً)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const VALID_ROLES = ['employee', 'hr_officer', 'department_manager', 'finance_officer', 'it_admin', 'super_admin']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

    // ③ المدخلات
    const body = await req.json()
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

    // ④ منع التكرار
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
      // listUsers لا يفلتر بالبريد بكفاءة — نتحقق بالسؤال المباشر:
    void existing
    const { data: dupEmployee } = await admin
      .from('employees')
      .select('id')
      .eq('employee_number', employeeNumber || '—')
      .maybeSingle()
    if (employeeNumber && dupEmployee) return json({ error: 'EMPLOYEE_NUMBER_TAKEN' }, 409)

    // ⑤ إنشاء مستخدم auth
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

    // ⑥ تعيين الدور (يمر عبر RPC ليُدقَّن في audit_logs)
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

    // ⑦ ربط سجل موظف (اختياري لكنه المعتاد)
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

    return json({ user_id: userId, email, role }, 200)
  } catch {
    return json({ error: 'INTERNAL' }, 500)
  }
})

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
