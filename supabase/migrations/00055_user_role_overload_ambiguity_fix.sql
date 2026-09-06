-- 00055 · إزالة التوقيع القديم المتعارض مع معامل p_actor الافتراضي.
-- وجود app.set_user_role بثلاثة وأربعة معاملات (الرابع default) يجعل نداء 3 معاملات ملتبساً.
drop function if exists app.set_user_role(uuid,text,boolean);

-- الغلاف ذو 3 معاملات يستدعي توقيع الأربعة صراحة، مع actor من JWT.
create or replace function public.set_user_role(p_user_id uuid,p_role text,p_grant boolean)
returns void language plpgsql security definer set search_path=public,app as $$
begin
  perform app.set_user_role(p_user_id,p_role,p_grant,auth.uid());
end $$;
grant execute on function public.set_user_role(uuid,text,boolean) to authenticated;
