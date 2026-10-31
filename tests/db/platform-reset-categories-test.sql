-- 00398-ج: كل فئة على حدة على مخطط حقيقي وبذوره، مع تراجع كل تجربة لعزلها
set client_min_messages=warning;
insert into auth.users(id,email) values('98200000-0000-0000-0000-000000000001','cat-reset@test.iq');
insert into public.user_roles(user_id,role) values('98200000-0000-0000-0000-000000000001','it_admin');
select set_config('auth.user_id','98200000-0000-0000-0000-000000000001',false);
do $$ declare r record; j jsonb; c text; t text; n bigint; before_units int; passed int:=0; begin
 select count(*) into before_units from public.permission_units;
 for r in select key from app.platform_reset_catalog() order by sort loop
   begin
     j:=public.platform_reset_request(array[r.key],'تصفير');
     if j->>'status'<>'done' then raise exception 'unexpected status for %: %',r.key,j; end if;
     for c in select jsonb_array_elements_text(j->'categories') loop
       foreach t in array app.platform_reset_tables(array[c]) loop
         if t not in ('audit_logs','notifications','space_reclaim_log','user_roles','user_permission_overrides','user_permission_template','user_page_overrides','notification_preferences','notification_push_subscriptions','manager_profiles','sector_manager_profiles','garage_user_profiles','follow_up_profiles','maintenance_workshop_accounts') then
           n:=app.platform_reset_table_count(t);
           if n<>0 then raise exception 'category % table % not empty: %',r.key,t,n; end if;
         end if;
       end loop;
     end loop;
     if (select count(*) from public.permission_units) <> before_units then raise exception 'permissions erased: %',r.key; end if;
     raise exception using errcode='P0098',message='rollback test case';
   exception when sqlstate 'P0098' then passed:=passed+1;
   when others then raise exception 'category % failed: %',r.key,sqlerrm;
   end;
 end loop;
 assert passed=25, 'must test all 25';
end $$;
