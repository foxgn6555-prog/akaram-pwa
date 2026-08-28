-- ═══════════════════════════════════════════════════════════════
-- 00020 · تفاصيل جدول واحد — وحدة قاعدة البيانات (البوابة التقنية)
-- الأعمدة والأنواع + حجم الصفوف — مع قائمة سماح للجدول (لا SQL ديناميكي من المستخدم)
-- ═══════════════════════════════════════════════════════════════

create or replace function app.db_table_details(p_table text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then
    raise exception 'DB_FORBIDDEN: مراقبة القاعدة محصورة بـ IT والإدارة العليا';
  end if;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = p_table
  ) into v_exists;

  if not v_exists then
    raise exception 'TABLE_NOT_FOUND: الجدول غير موجود';
  end if;

  return jsonb_build_object(
    'table', p_table,
    'columns', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name',     column_name,
        'type',     data_type,
        'nullable', is_nullable = 'YES'
      ) order by ordinal_position), '[]'::jsonb)
      from information_schema.columns
      where table_schema = 'public' and table_name = p_table
    ),
    'row_estimate', (
      select coalesce(greatest(n_live_tup, 0), 0)
      from pg_stat_user_tables
      where schemaname = 'public' and relname = p_table
    ),
    'total_bytes', pg_total_relation_size(format('%I.%I', 'public', p_table))
  );
end;
$$;

grant execute on function app.db_table_details(text) to authenticated;
