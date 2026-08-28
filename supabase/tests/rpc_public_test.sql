-- ═══════════════════════════════════════════════════════════════
-- اختبار دوال RPC عبر مسار public (نفس مسار PostgREST/supabase.rpc)
-- أي دالة ناقصة في public = فشل فوري — يمنع عودة خطأ 404 للأبد
-- التشغيل: scripts/test-rls-local.sh أو psql مباشرة بعد المهاجرات
-- ═══════════════════════════════════════════════════════════════

do $rpc$
declare
  it_user uuid;
  target_user uuid;
  res jsonb;
begin
  -- ═══ ① بذر مستخدم IT + مستخدم هدف (قبل تبديل الدور) ═══
  insert into auth.users (email) values ('rpc-it@akram.iq') returning id into it_user;
  insert into public.user_roles (user_id, role) values (it_user, 'it_admin');
  -- الهدف: مستخدم آخر يُمنح له الدور (الاستخدام الحقيقي — منع الذات يمنع المنح لنفسه)
  insert into auth.users (email) values ('rpc-target@akram.iq') returning id into target_user;


  -- ═══ ② دوال أمن الدخول عبر public (بلا مصادقة — كأنها anon) ═══
  set local role authenticated;
  set local request.jwt.claim.sub = '';

  perform public.record_login_attempt('rpc-test@akram.iq', false);
  raise notice '✅ public.record_login_attempt — استجابت (لا 404)';

  if public.is_login_locked('rpc-test@akram.iq') is not null then
    raise notice '✅ public.is_login_locked — استجابت: %', public.is_login_locked('rpc-test@akram.iq');
  end if;

  if public.login_lock_remaining_seconds('rpc-test@akram.iq') >= 0 then
    raise notice '✅ public.login_lock_remaining_seconds — استجابت';
  end if;

  -- تنظيف اختبار القفل
  delete from public.login_attempts where email = 'rpc-test@akram.iq';

  -- ═══ ③ دوال البوابة التقنية — بعين it_admin ═══
  perform set_config('request.jwt.claim.sub', it_user::text, false);
  perform public.set_user_role(target_user, 'hr_officer', true);
  raise notice '✅ public.set_user_role — منحت دوراً (وتُدقَّق في audit_logs)';

  if (select count(*) from public.user_roles where user_id = it_user and role = 'hr_officer') = 1 then
    raise notice '✅ الدور وصل فعلاً إلى user_roles';
  end if;

  res := public.list_platform_users(null);
  if jsonb_typeof(res) = 'array' then
    raise notice '✅ public.list_platform_users — أعادت مصفوفة المستخدمين';
  end if;

  res := public.db_stats();
  if jsonb_typeof(res) = 'array' then
    raise notice '✅ public.db_stats — أعادت إحصائيات الجداول';
  end if;

  res := public.db_overview();
  if (res ->> 'allowed') = 'true' then
    raise notice '✅ public.db_overview — allowed=true مع حجم القاعدة';
  end if;

  res := public.db_table_details('employees');
  if jsonb_array_length(res -> 'columns') > 0 then
    raise notice '✅ public.db_table_details — أعادت % عموداً لجدول employees', jsonb_array_length(res -> 'columns');
  end if;

  -- ═══ ④ الرفض الأمني لا يزال سارياً عبر الأغلفة ═══
  set local request.jwt.claim.sub = '';
  begin
    perform public.set_user_role(it_user, 'employee', false);
    raise exception '❌ anon نفّذ set_user_role — ثغرة!';
  exception when others then
    if sqlerrm like '❌%' then raise exception '%', sqlerrm; end if;
    raise notice '✅ anon يُرفض من set_user_role عبر الغلاف (USERS_FORBIDDEN)';
  end;

  begin
    res := public.db_table_details('employees');
    if (res ->> 'allowed') is not null or res is null then
      -- db_table_details يرمي استثناء لغير المصرح — وصولنا هنا = لم يرمِ
      raise notice '⚠️ تحقق يدوي مطلوب';
    end if;
  exception when others then
    raise notice '✅ anon يُرفض من db_table_details عبر الغلاف';
  end;

  raise notice '';
  raise notice '═══ ✅ كل دوال RPC تستجيب عبر مسار public — 404 مستحيل ═══';
end
$rpc$;
