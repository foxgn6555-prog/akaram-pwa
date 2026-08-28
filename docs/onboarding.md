# دليل المطور الجديد

## اليوم الأول
1. المتطلبات: Node 22+ (`nvm use`)، Supabase CLI، Docker (لتشغيل Supabase محلياً).
2. `npm ci` → `cp .env.example .env.local` → املأ من `supabase status`.
3. `npm run db:reset && npm run db:seed` → `npm run db:types` → `npm run dev`.
4. أنشئ مستخدم admin من Studio (54323) ثم `insert into user_roles ... 'super_admin'`.

## اقرأ أولاً (بالترتيب)
`docs/adr/001..007` — قرارات المشروع السبعة ثم:
- **قانون SDK**: Supabase داخل `src/services` فقط (ESLint يمنع، والباقي مراجعة بشرية).
- **قانون Query Keys**: كل المفاتيح من `src/lib/query-keys` — لا inline.
- **قانون Features**: features تتواصل عبر `index.ts` العام فقط.
- **قانون Portals**: البوابات تخطيط وملاحة — المنطق في features، والحكم النهائي في RLS.

## مهامك الأولى المقترحة
1. نفّذ TODO في `src/services/requests.sdk.ts` (النمط المرجعي جاهز في employees.sdk.ts).
2. أكمل `src/portals/employee/routes.tsx`.
3. اكتب `tests/integration/rls.employee.test.ts` الأول.

## قائمة تحقق قبل أي PR
- [ ] lint + typecheck + unit + integration خضراء
- [ ] جدول جديد؟ → RLS + version + updated_at + فهرس + تحديث docs/database-schema.md
- [ ] لا أسرار في الكود — كل شيء عبر .env
