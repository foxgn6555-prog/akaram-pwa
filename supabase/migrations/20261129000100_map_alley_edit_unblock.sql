-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 20261129000100 — تعديل الزقاق كان **مستحيلاً**: سجل التعديل يقرأ عموداً غير موجود
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- العطل (أُعيد إنتاجه على قاعدة كاملة بـ٤٦١ مهاجرة، ثم تأكّد على الإنتاج بالكائنات):
--
--   `app.map_edit_log_trigger` مشترك بين الشوارع والأزقة، ويقرأ `new.kind`:
--
--       if tg_op = 'UPDATE' and new.kind is distinct from old.kind then …
--       if new.width_m is distinct from old.width_m then …
--
--   و`map_streets` فيه `kind`، أما `map_alleys` **فلا يوجد فيه هذا العمود إطلاقاً**
--   (تحقّق على الإنتاج: `information_schema.columns` ⇒ 0 لـ map_alleys، 1 لـ map_streets).
--   وعند EVAL في plpgsql يُترجم `new.kind` إلى `(NEW).kind`، فتفشل أي عملية تحديث على
--   `map_alleys` — **حتى لو لم يتغيّر شيء**:
--
--       ERROR:  record "new" has no field "kind"
--
--   النتيجة العملية: كل تعديل زقاق من غرفة العمليات يفشل. و`map_alleys_edit_log`
--   يعمل AFTER UPDATE، فلا يُسجَّل شيء ولا يصل المشرف أي أثر.
--
--   عيب ثانٍ في نفس الدالة: `width_m` يُسجَّل دائماً بلا `tg_op = 'UPDATE'`، وهو
--   سياق UPDATE فقط — صحيح بالمصادفة لا بالتصميم.
--
-- الإصلاح: قراءة الحقل عبر `to_jsonb(new)` بدل الاسم المباشر. الحقل الغائب يعطي
--   `null` بدل خطأ، ويبقى السجل دقيقاً: يُسجَّل تغيّر `kind` للشوارع فقط، ولا
--   يُسجَّل شيء للأزقة لأنها لا تحمله.
--
-- ما لا تغيّره هذه المهاجرة: أعمدة الجداول، الحُرّاس الهندسية، الصلاحيات، ولا
--   صفوفاً قائمة. أثرها الوحيد أن التحديث على `map_alleys` يعود ممكناً.
--
-- التراجع: أعد تعريف الدالة بجسم 20261122001500 كما هو (يعيد العطل بقصد).
-- ═══════════════════════════════════════════════════════════════════════════════════════

create or replace function app.map_edit_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_table text := tg_table_name;
  -- قراءة موحّدة: تعمل على الجدولين مهما اختلفت أعمدتهما
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
begin
  if (v_new ->> 'name') is distinct from (v_old ->> 'name') then
    insert into public.map_edit_log(zone_id, table_name, row_id, code, field, old_value, new_value)
    values (new.zone_id, v_table, new.id, new.code, 'name', v_old ->> 'name', v_new ->> 'name');
  end if;

  if (v_new -> 'path') is distinct from (v_old -> 'path') then
    insert into public.map_edit_log(zone_id, table_name, row_id, code, field, old_value, new_value)
    values (new.zone_id, v_table, new.id, new.code, 'path',
            round(app.map_line_length_m((v_old -> 'path'))::numeric, 1)::text || ' م',
            round(app.map_line_length_m((v_new -> 'path'))::numeric, 1)::text || ' م');
  end if;

  -- `kind` موجود في الشوارع فقط — الغياب يعني «لا شيء يُسجَّل»، لا خطأ
  if tg_op = 'UPDATE' and (v_new ->> 'kind') is distinct from (v_old ->> 'kind') then
    insert into public.map_edit_log(zone_id, table_name, row_id, code, field, old_value, new_value)
    values (new.zone_id, v_table, new.id, new.code, 'kind', v_old ->> 'kind', v_new ->> 'kind');
  end if;

  if (v_new ->> 'width_m') is distinct from (v_old ->> 'width_m') then
    insert into public.map_edit_log(zone_id, table_name, row_id, code, field, old_value, new_value)
    values (new.zone_id, v_table, new.id, new.code, 'width_m', v_old ->> 'width_m', v_new ->> 'width_m');
  end if;

  return new;
end $$;

comment on function app.map_edit_log_trigger() is
  'يسجّل التعديلات الفعلية على الشوارع والأزقة. يقرأ الحقول عبر to_jsonb لأن map_alleys بلا عمود kind '
  '— والقراءة المباشرة كانت تُسقط كل تحديث على الزقاق بخطأ «record new has no field kind».';

revoke all on function app.map_edit_log_trigger() from public, anon;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- تحقّق ذاتي: المهاجرة تفشل صراحةً إن بقي العمود مفقوداً في أحد الجدولين
-- (شبكة أمان لمن يقرأ هذا الملف بعد تغيير مخطط لاحق)
-- ───────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_n int;
begin
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public' and table_name in ('map_streets', 'map_alleys')
     and column_name = 'width_m';
  if v_n <> 2 then
    raise exception 'MAP_EDIT_LOG_SCHEMA: width_m يجب أن يكون موجوداً في الجدولين (وُجد %)', v_n;
  end if;
end $$;
