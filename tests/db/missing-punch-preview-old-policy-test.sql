-- محاكاة سياسة قديمة غير صالحة كانت مخزنة قبل إضافة حارس 00353؛ للاختبار فقط.
set client_min_messages=warning;
insert into auth.users(id,email) values('40140000-0000-0000-0000-000000000001','mp-old-policy@test.invalid');
insert into public.user_roles(user_id,role) values('40140000-0000-0000-0000-000000000001','it_admin');
select set_config('auth.user_id','40140000-0000-0000-0000-000000000001',false);
alter table public.hr_policy disable trigger hr_validate_missing_punch_settings;
do $$declare j jsonb; m date:=app.hr_local_date(now()); begin
 update public.hr_policy set settings=settings||'{"missing_punch_threshold":0,"missing_punch_fixed_amount":100}'::jsonb where id=1;
 j:=public.ops_missing_punch_month_preview(m);
 assert not (j->>'settings_configured')::boolean and j->'total_proposed_amount'='null'::jsonb,'zero threshold not accepted';
 update public.hr_policy set settings=settings||'{"missing_punch_threshold":3,"missing_punch_fixed_amount":"not numeric"}'::jsonb where id=1;
 j:=public.ops_missing_punch_month_preview(m);
 assert not (j->>'settings_configured')::boolean,'bad amount not accepted';
 update public.hr_policy set settings=settings||'{"missing_punch_threshold":3.0,"missing_punch_fixed_amount":100.25}'::jsonb where id=1;
 j:=public.ops_missing_punch_month_preview(m);
 assert (j->>'settings_configured')::boolean and (j->>'threshold')::int=3 and (j->>'fixed_amount')::numeric=100.25,'valid numeric decimal threshold';
end$$;
alter table public.hr_policy enable trigger hr_validate_missing_punch_settings;
