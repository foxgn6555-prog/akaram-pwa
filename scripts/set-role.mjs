#!/usr/bin/env node
/**
 * منح/سحب دور لمستخدم — مباشرة من الترمينال إلى قاعدة البيانات
 * الاستخدام:
 *   npm run role:set -- <email> <role>            منح
 *   npm run role:set -- <email> <role> --revoke   سحب
 * مثال:
 *   npm run role:set -- admin@akram.iq it_admin
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnvFile, VALID_ROLES, ROLE_PORTALS } from './lib/env.mjs'

const args = process.argv.slice(2).filter((a) => a !== '--revoke')
const revoke = process.argv.includes('--revoke')
const [email, role] = args

if (!email || !role) {
  console.error('الاستخدام: npm run role:set -- <email> <role> [--revoke]')
  console.error(`الأدوار: ${VALID_ROLES.join(' · ')}`)
  process.exit(1)
}
if (!VALID_ROLES.includes(role)) {
  console.error(`❌ دور غير معروف: ${role}\nالأدوار الصحيحة: ${VALID_ROLES.join(' · ')}`)
  process.exit(1)
}

const env = loadEnvFile()
const url = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('❌ VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY مفقودة في .env.local')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

// ① إيجاد المستخدم
const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
if (listErr) { console.error('❌', listErr.message); process.exit(1) }
const user = list.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase())
if (!user) {
  console.error(`❌ لا يوجد مستخدم بالبريد: ${email}`)
  console.error('   أنشئه أولاً من: Dashboard → Authentication → Users')
  process.exit(1)
}

// ② الدور
if (revoke) {
  const { error } = await admin.from('user_roles').delete().match({ user_id: user.id, role })
  if (error) { console.error('❌', error.message); process.exit(1) }
  console.log(`✅ سُحب الدور «${role}» من ${email}`)
} else {
  const { error } = await admin
    .from('user_roles')
    .upsert({ user_id: user.id, role }, { onConflict: 'user_id,role', ignoreDuplicates: true })
  if (error) { console.error('❌', error.message); process.exit(1) }
  console.log(`✅ مُنح «${email}» الدور: ${role}`)

  // ③ سجل موظف مرتبط إن لم يوجد
  const { data: emp } = await admin.from('employees').select('id').eq('user_id', user.id).maybeSingle()
  if (!emp) {
    const employeeNumber = 'EMP-' + String(Date.now()).slice(-6)
    const { error: empErr } = await admin.from('employees').insert({
      user_id: user.id,
      employee_number: employeeNumber,
      full_name: email.split('@')[0],
    })
    if (empErr) {
      console.warn(`⚠️ المستخدم مُنح الدور لكن فشل إنشاء سجل الموظف: ${empErr.message}`)
    } else {
      console.log(`✅ أُنشئ سجل موظف مرتبط: ${employeeNumber}`)
    }
  }
  console.log(`🌐 بوابة الدخول: ${ROLE_PORTALS[role]}`)
  console.log('🔁 ساري من الدخول التالي (أو حدّث الصفحة)')
}
