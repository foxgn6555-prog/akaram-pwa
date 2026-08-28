#!/usr/bin/env node
/**
 * إنشاء مستخدم كامل من الترمينال: حساب + دور + سجل موظف
 * الاستخدام:
 *   npm run user:create -- <email> <password> "<الاسم الكامل>" <role> [employee_number]
 * مثال:
 *   npm run user:create -- hr@akram.iq Passw0rd1 "سارة الكريمي" hr_officer HR-001
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnvFile, VALID_ROLES, ROLE_PORTALS } from './lib/env.mjs'

const [email, password, fullName, role, employeeNumberArg] = process.argv.slice(2)

if (!email || !password || !fullName || !role) {
  console.error('الاستخدام: npm run user:create -- <email> <password> "<الاسم>" <role> [employee_number]')
  console.error(`الأدوار: ${VALID_ROLES.join(' · ')}`)
  process.exit(1)
}
if (!VALID_ROLES.includes(role)) {
  console.error(`❌ دور غير معروف: ${role}`)
  process.exit(1)
}
if (password.length < 8) {
  console.error('❌ كلمة المرور: 8 أحرف على الأقل')
  process.exit(1)
}

const env = loadEnvFile()
const url = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

// ① الحساب
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email: email.toLowerCase(),
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
})
if (createErr) {
  console.error('❌ فشل الإنشاء:', createErr.message)
  process.exit(1)
}
const userId = created.user.id

// ② الدور
const { error: roleErr } = await admin
  .from('user_roles')
  .upsert({ user_id: userId, role }, { onConflict: 'user_id,role' })
if (roleErr) {
  await admin.auth.admin.deleteUser(userId) // تراجع نظيف
  console.error('❌ فشل تعيين الدور — حُذف الحساب حديث الإنشاء:', roleErr.message)
  process.exit(1)
}

// ③ سجل الموظف
const employeeNumber = employeeNumberArg ?? 'EMP-' + String(Date.now()).slice(-6)
const { error: empErr } = await admin.from('employees').insert({
  user_id: userId,
  employee_number: employeeNumber,
  full_name: fullName,
})
if (empErr) {
  console.warn(`⚠️ أُنشئ الحساب والدور، لكن فشل ربط الموظف: ${empErr.message}`)
} 

console.log('')
console.log('═══ ✅ تم إنشاء المستخدم كاملاً ═══')
console.log(`   البريد:   ${email.toLowerCase()}`)
console.log(`   الاسم:    ${fullName}  (${employeeNumber})`)
console.log(`   الدور:    ${role} → البوابة: ${ROLE_PORTALS[role]}`)
console.log('   الدخول:   من صفحة تسجيل الدخول في التطبيق مباشرة')
