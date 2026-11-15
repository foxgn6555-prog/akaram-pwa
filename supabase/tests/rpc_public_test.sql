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
  -- ═══  بذر مستخدم IT + مستخدم هدف (قبل تبديل الدور) ═══
  -- معرّفات صريحة: مخطط auth المحلي في CLI لا يضمن default لـ auth.users.id.
  insert into auth.users (id, email) values ('a1500000-0000-0000-0000-000000000001', 'rpc-it@akram.iq') returning id into it_user;
  insert into public.user_roles (user_id, role) values (it_user, 'it_admin');
  -- 00371 يسمح لـ IT بتعديل الذات؛ نفحص المنح لمستخدم آخر كحالة الاستخدام الأساسية.
  insert into auth.users (id, email) values ('a1500000-0000-0000-0000-000000000002', 'rpc-target@akram.iq') returning id into target_user;


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

  -- تحقّق إلزامي من المستخدم الهدف. RLS يخفي أدوار الآخرين عن IT،
  -- لذلك نراجع الصف كمراقب postgres ثم نعيد دور جلسة الاختبار.
  perform set_config('role', 'postgres', false);
  if not exists (select 1 from public.user_roles where user_id = target_user and role = 'hr_officer') then
    raise exception '❌ الدور لم يصل إلى المستخدم الهدف';
  end if;
  perform set_config('role', 'authenticated', false);
  raise notice '✅ الدور وصل فعلاً إلى user_roles';

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
    if sqlerrm not like 'USERS_FORBIDDEN:%' then
      raise exception '❌ رفض غير متوقع من set_user_role: %', sqlerrm;
    end if;
    raise notice '✅ anon يُرفض من set_user_role عبر الغلاف (USERS_FORBIDDEN)';
  end;

  begin
    res := public.db_table_details('employees');
    raise exception '❌ anon نفّذ db_table_details — ثغرة!';
  exception when others then
    if sqlerrm like '❌%' then raise exception '%', sqlerrm; end if;
    if sqlerrm not like 'DB_FORBIDDEN:%' then
      raise exception '❌ رفض غير متوقع من db_table_details: %', sqlerrm;
    end if;
    raise notice '✅ anon يُرفض من db_table_details عبر الغلاف';
  end;

  raise notice '';
  raise notice '═══ ✅ كل دوال RPC تستجيب عبر مسار public — 404 مستحيل ═══';
end
$rpc$;
