#!/usr/bin/env node
/**
 * إعادة تعيين كلمة مرور مستخدم — من الترمينال (بدون بريد إلكتروني)
 * الاستخدام:
 *   npm run user:reset-pass -- <email> <NewPassword>
 * مثال:
 *   npm run user:reset-pass -- hr@akram.iq NewPass123
 * ملاحظات:
 *   • كلمات المرور مُجزَّأة bcrypt — لا يمكن استرجاع القديمة، فقط تعيين الجديدة.
 *   • يؤكد البريد تلقائياً (email_confirm) ويرفع أي حظر — يعالج أشيع أسباب فشل الدخول.
 *   • يتطلب SUPABASE_SERVICE_ROLE_KEY في .env.local (مفتاح sb_secret_ — لا يُوضع أبداً بمتغير VITE_).
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnvFile, ROLE_PORTALS } from './lib/env.mjs'

const [email, password] = process.argv.slice(2)

if (!email || !password) {
  console.error('الاستخدام: npm run user:reset-pass -- <email> <NewPassword>')
  process.exit(1)
}
if (password.length < 8) {
  console.error('❌ كلمة المرور: 8 أحرف على الأقل')
  process.exit(1)
}

const env = loadEnvFile()
const url = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('❌ VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY مفقودة في .env.local')
  console.error('   أضف مفتاح الخدمة (sb_secret_...) من: Dashboard → Settings → API Keys')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

// ① إيجاد المستخدم
const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
if (listErr) { console.error('❌', listErr.message); process.exit(1) }
const user = list.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase())
if (!user) {
  console.error(`❌ لا يوجد مستخدم بالبريد: ${email}`)
  console.error('   أنشئه أولاً: npm run user:create -- <email> <password> "<الاسم>" <role>')
  process.exit(1)
}

// ② تعيين كلمة المرور الجديدة + تأكيد البريد + رفع أي حظر إداري
const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
  password,
  email_confirm: true,
  ban_duration: 'none',
})
if (updateErr) { console.error('❌ فشل التعيين:', updateErr.message); process.exit(1) }

// ③ عرض أدواره الحالية (للتشخيص)
const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id)
const rolesList = roles?.map((r) => r.role) ?? []

console.log('')
console.log('═══ ✅ أُعيدت تعيين كلمة المرور ═══')
console.log(`   البريد:    ${email.toLowerCase()}`)
if (rolesList.length) {
  console.log(`   الأدوار:   ${rolesList.join(' · ')}`)
  console.log(`   البوابة:   ${ROLE_PORTALS[rolesList[0]] ?? '—'}`)
} else {
  console.log('   الأدوار:   ⚠️ بلا أدوار — منحه عبر: npm run role:set -- <email> <role>')
}
console.log('   الدخول:    من صفحة تسجيل الدخول مباشرة بكلمة المرور الجديدة')
console.log('   ملاحظة:    إن كان الدخول مقفولاً (محاولات متكررة) — انتظر ربع ساعة أو امسح القفل من القاعدة')
