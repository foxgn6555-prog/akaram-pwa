-- ═══════════════════════════════════════════════════════════════
-- 00001 · الإضافات (Extensions) + المخطط المساعد
-- ═══════════════════════════════════════════════════════════════

-- UUID التوليد مدمج في PostgreSQL 13+ (gen_random_uuid) — لا حاجة لـ uuid-ossp
create extension if not exists pg_trgm;      -- البحث الضبابي بأسماء الموظفين
create extension if not exists btree_gin;    -- فهارس مركّبة لاستعلامات RLS

-- مخطط مساعد: دوال utilities فقط — لا جداول بيانات هنا
create schema if not exists app;

comment on schema app is 'دوال مساعدة لـ Auth/RLS/Audit — لا بيانات عمل في هذا المخطط';

grant usage on schema app to authenticated, anon, service_role;
