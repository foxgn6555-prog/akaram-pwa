-- ═══════════════════════════════════════════════════════════════
-- 00041 · توسعة أنواع كشوفات وحدة الكشوفات
--   · الشفت: ثلاث نوبات ذاتية (صباحي / مسائي / ليلي) — كان (صباحي/مسائي)
--   · المخالفات: + انسحاب مبكر (early_withdrawal) + نقص حمولة (load_deficiency)
--     — كان (تأخير/غياب/جباية/تهرب من العمل)
--   · المتعهد: خيارا الواجهة (ذاتي / مؤجر) — الحقل نصي حر تاريخياً فلا قيد جديد
--   · «توبيخ» (reprimand) يبقى صالحاً في القاعدة للسجلات التاريخية فقط،
--     وأُلغي من خيارات الواجهة (عقد الواجهة: warning | termination)
-- ═══════════════════════════════════════════════════════════════

-- ① إسقاط قيود الشفت ونوع المخالفة القديمة (أُنشئت بلا اسم في 00040)
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.disclosures'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) like '%(shift %'
           or pg_get_constraintdef(oid) like '%(violation_type %')
  loop
    execute format('alter table public.disclosures drop constraint %I', r.conname);
  end loop;
end $$;

-- ② الشفت: ثلاث نوبات ذاتية
alter table public.disclosures
  add constraint disclosures_shift_check
  check (shift in ('morning','evening','night'));

-- ③ المخالفات: الستّة (منها انسحاب مبكر ونقص حمولة)
alter table public.disclosures
  add constraint disclosures_violation_type_check
  check (violation_type in
    ('delay','absence','collection','evasion','early_withdrawal','load_deficiency'));

-- ④ توثيق خيارَي المتعهد في الواجهة (ذاتي / مؤجر)
comment on column public.disclosures.contractor_name is
  'المتعهد/نوع التشغيل — خيارا الواجهة: ذاتي (تشغيل ذاتي) أو مؤجر (آلية مؤجرة)';

-- ⑤ تحديث الملخص الإحصائي ليشمل المخالفات الجديدة
create or replace function app.disclosure_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not app.has_role(array['disclosures_officer','deputy_director','executive_director',
                                'ops_room','super_admin']) then '{}'::jsonb
    else (
      select jsonb_build_object(
        'total',        count(*) filter (where archived_at is null),
        'drafts',       count(*) filter (where status='draft' and archived_at is null),
        'submitted',    count(*) filter (where status='submitted_to_deputy' and archived_at is null),
        'archived',     count(*) filter (where archived_at is not null),
        'today',        count(*) filter (where log_date = current_date and archived_at is null),
        'by_violation', jsonb_build_object(
          'delay',            count(*) filter (where violation_type='delay' and archived_at is null),
          'absence',          count(*) filter (where violation_type='absence' and archived_at is null),
          'collection',       count(*) filter (where violation_type='collection' and archived_at is null),
          'evasion',          count(*) filter (where violation_type='evasion' and archived_at is null),
          'early_withdrawal', count(*) filter (where violation_type='early_withdrawal' and archived_at is null),
          'load_deficiency',  count(*) filter (where violation_type='load_deficiency' and archived_at is null)
        )
      )
      from public.disclosures
    )
  end;
$$;
