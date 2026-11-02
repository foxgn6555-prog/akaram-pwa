-- 00400-أ: إعداد حد البصمة الناقصة والمبلغ الثابت فقط؛ لا احتساب ولا تأثير مالي في هذه الجولة.
-- يُخزّن الإعداد ضمن سياسة HR الحالية لكي يبقى جزءاً من إعدادات المنصة وتصفيرها المعتاد.
-- غياب المفتاحين يعني «لم يُضبط بعد» وليس مبلغاً أو حداً مفترضاً.
create or replace function app.hr_validate_missing_punch_settings() returns trigger
language plpgsql security definer set search_path=public,app as $$
declare old_pair jsonb; new_pair jsonb; n numeric; amount numeric;
begin
  if new.settings ? 'missing_punch_threshold' or new.settings ? 'missing_punch_fixed_amount' then
    if jsonb_typeof(new.settings->'missing_punch_threshold') is distinct from 'number'
       or jsonb_typeof(new.settings->'missing_punch_fixed_amount') is distinct from 'number' then
      raise exception 'HR_MISSING_PUNCH_SETTINGS_INVALID';
    end if;
    n := (new.settings->>'missing_punch_threshold')::numeric;
    amount := (new.settings->>'missing_punch_fixed_amount')::numeric;
    if n <> trunc(n) or n not between 1 and 31 or amount < 0 or amount > 999999999999.99 or amount <> round(amount,2) then
      raise exception 'HR_MISSING_PUNCH_SETTINGS_INVALID';
    end if;
  end if;
  new_pair := jsonb_build_object('threshold',new.settings->'missing_punch_threshold','amount',new.settings->'missing_punch_fixed_amount');
  old_pair := case when tg_op='UPDATE' then jsonb_build_object('threshold',old.settings->'missing_punch_threshold','amount',old.settings->'missing_punch_fixed_amount') else jsonb_build_object('threshold',null,'amount',null) end;
  if new_pair is distinct from old_pair then
    if auth.uid() is not null and not app.has_role(array['it_admin','super_admin']) then raise exception 'IT_FORBIDDEN'; end if;
    insert into public.hr_deduction_rule_audit(action,before,after,actor)
    values('missing_punch_settings',old_pair,new_pair,auth.uid());
  end if;
  return new;
end$$;
revoke all on function app.hr_validate_missing_punch_settings() from public,anon,authenticated;
drop trigger if exists hr_validate_missing_punch_settings on public.hr_policy;
create trigger hr_validate_missing_punch_settings before insert or update of settings on public.hr_policy
for each row execute function app.hr_validate_missing_punch_settings();

create or replace function public.it_missing_punch_settings_set(p_threshold int,p_amount numeric) returns jsonb
language plpgsql security definer set search_path=public,app as $$
declare v jsonb;
begin
  perform app.require_it();
  if p_threshold is null or p_threshold not between 1 and 31 or p_amount is null or p_amount < 0 or p_amount > 999999999999.99 or p_amount <> round(p_amount,2) then
    raise exception 'HR_MISSING_PUNCH_SETTINGS_INVALID';
  end if;
  -- التحديث على الصف نفسه يمنع فقدان إعدادات أخرى بسبب قراءة قديمة متزامنة.
  update public.hr_policy set settings=settings||jsonb_build_object('missing_punch_threshold',p_threshold,'missing_punch_fixed_amount',p_amount),
      updated_by=auth.uid(),updated_at=now() where id=1 returning settings into v;
  if v is null then raise exception 'HR_POLICY_NOT_FOUND'; end if;
  return v;
end$$;
revoke all on function public.it_missing_punch_settings_set(int,numeric) from public,anon;
grant execute on function public.it_missing_punch_settings_set(int,numeric) to authenticated;
