-- 00270 — الأرشيف البارد (٣/٤): سماح قراءة محدود لحساب IT على ملفات التخزين
--  أداة akaram-archive تسجّل دخولها بحساب IT عادي (لا مفتاح خدمة). حساب IT لا يرى صور البوابات عادةً،
--  لذا يُسمح له بقراءة ملف واحد فقط إن كان مُدرجاً في حزمة أرشيف بارد نشطة (ready/verified) ولم يُحذف.
--  لا يمنح هذا أي قراءة خارج الحزم، ولا كتابة/حذف.

create or replace function app.cold_archive_object_in_active_package(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.cold_archive_items i
    join public.cold_archive_packages p on p.id = i.package_id
    where i.bucket = p_bucket and i.storage_path = p_name
      and i.status in ('listed', 'downloaded') and p.status in ('ready', 'verified')
  )
$$;
revoke all on function app.cold_archive_object_in_active_package(text, text) from public;
grant execute on function app.cold_archive_object_in_active_package(text, text) to authenticated;

drop policy if exists "cold-archive: IT reads packaged files" on storage.objects;
create policy "cold-archive: IT reads packaged files" on storage.objects for select to authenticated
  using (app.has_role(array['it_admin', 'super_admin']) and app.cold_archive_object_in_active_package(bucket_id, name));
