-- 00358 · المصاريف + ربط مشتريات الصيانة بالقاصة (بادئة xp): الأنواع الابتدائية وإدارتها (المالية فقط، النظامي محمي)، تسجيل مصروف فوري يُخصم
--        من الرصيد، الرصيد غير الكافي يمنع، المدخلات الخاطئة، الإلغاء بسبب يُعيد المبلغ، أمر شراء ⇒ حركة معلّقة بمبلغه ⇒ «تم التسليم» يخصم ويبلّغ
--        صاحب الأمر، الإعادة بسبب، تدقيق أمر الشراء (كمية/سعر فارغان ⇒ خطأ واضح)، قائمة المالية بحالة الدفع، ملخّص القاصة، الاحتفاظ والصلاحيات.
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values ('db000000-0000-0000-0000-000000000001', 'xp-exec@t.iq'), ('db000000-0000-0000-0000-000000000002', 'xp-fin@t.iq'),
  ('db000000-0000-0000-0000-000000000003', 'xp-hr@t.iq'), ('db000000-0000-0000-0000-000000000004', 'xp-maint@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('db000000-0000-0000-0000-000000000001', 'executive_director'), ('db000000-0000-0000-0000-000000000002', 'finance_officer'),
  ('db000000-0000-0000-0000-000000000003', 'hr_officer'), ('db000000-0000-0000-0000-000000000004', 'maintenance') on conflict do nothing;

-- رصيد ابتدائي: المدير التنفيذي يسجّل استلاماً 1,000,000 وتؤكده المالية
select auth.set_test_user('db000000-0000-0000-0000-000000000001');
select set_config('test.xp_type', (select t ->> 'id' from jsonb_array_elements(public.exec_receivable_type_save(null, 'xp مستحقات', true, 1)) t where t ->> 'name' = 'xp مستحقات'), false);
select set_config('test.xp_rc', (public.exec_treasury_record('receipt', 1000000, current_setting('test.xp_type')::uuid, null, null, 'وصل xp') ->> 'id'), false);
select auth.set_test_user('db000000-0000-0000-0000-000000000002');
select public.finance_treasury_confirm(current_setting('test.xp_rc')::uuid, null);
select set_config('test.xp_bal0', app.treasury_balance()::text, false);

-- ═══ T1 · الأنواع الابتدائية + إدارتها من المالية فقط + النوع النظامي محمي ═══
do $$ declare j jsonb; n int; nid uuid; sys uuid; begin
  j := public.finance_expense_types_list();
  assert (select count(*) from jsonb_array_elements(j) e where e ->> 'name' in ('مصاريف ورق وقرطاسية', 'مصاريف تشغيلية', 'وقود ومحروقات', 'ضيافة', 'نقل ومواصلات', 'صيانة وإصلاحات بسيطة', 'مشتريات صيانة', 'أخرى')) = 8, 'T1 seed: ' || j::text;
  nid := (public.finance_expense_type_save(null, 'مصاريف إنترنت', true, 55) ->> 'id')::uuid;
  assert nid is not null, 'T1 add type';
  begin perform public.finance_expense_type_save(null, 'مصاريف إنترنت', true, 1); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_TYPE_DUPLICATE', 'T1 dup: ' || sqlerrm; end;
  begin perform public.finance_expense_type_save(null, 'x', true, 1); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_TYPE_NAME_INVALID', 'T1 short: ' || sqlerrm; end;
  select id into sys from public.treasury_expense_types where is_system;
  begin perform public.finance_expense_type_save(sys, 'مشتريات صيانة', false, 70); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_TYPE_SYSTEM', 'T1 system: ' || sqlerrm; end;
  perform set_config('test.xp_t1', nid::text, false);
  raise notice 'T1 ✅ 8 أنواع ابتدائية + إضافة نوع + حماية النظامي';
end $$;
select auth.set_test_user('db000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.finance_expense_type_save(null, 'نوع من التنفيذي', true, 1); raise exception 'should fail'; exception when others then assert sqlerrm = 'FINANCE_FORBIDDEN', 'T1 exec: ' || sqlerrm; end;
  assert jsonb_array_length(public.finance_expense_types_list()) >= 9, 'T1 exec can read types';
end $$;
select auth.set_test_user('db000000-0000-0000-0000-000000000003');
do $$ begin
  assert public.finance_expense_types_list() = '[]'::jsonb, 'T1 hr reads nothing';
  begin perform public.finance_expense_record((select id from public.treasury_expense_types limit 1), 1000, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'FINANCE_FORBIDDEN', 'T1 hr record: ' || sqlerrm; end;
end $$;

-- ═══ T2 · تسجيل مصروف: فوري (confirmed) يُخصم من الرصيد، بلا موافقة؛ رقم حركة؛ إشعار المدير التنفيذي؛ المدخلات الخاطئة ═══
select auth.set_test_user('db000000-0000-0000-0000-000000000002');
do $$ declare j jsonb; b0 numeric := current_setting('test.xp_bal0')::numeric; tid uuid := current_setting('test.xp_t1')::uuid; n int; begin
  j := public.finance_expense_record(tid, 150000, 'اشتراك شهر 10');
  assert j ->> 'kind' = 'expense' and j ->> 'status' = 'confirmed' and (j ->> 'affects_balance')::boolean and (j ->> 'needs_finance')::boolean = false
     and j ->> 'type_name' = 'مصاريف إنترنت' and (j ->> 'amount')::numeric = 150000 and j ->> 'ref_no' like 'TR-%' and j ->> 'confirmed_by' is not null, 'T2 json: ' || j::text;
  assert app.treasury_balance() = b0 - 150000, 'T2 balance: ' || app.treasury_balance();
  select count(*) into n from public.notifications where user_id = 'db000000-0000-0000-0000-000000000001' and title = 'مصروف من القاصة' and body like '%مصاريف إنترنت · 150,000 د.ع · اشتراك شهر 10%'; assert n = 1, 'T2 exec notified: ' || n;
  perform set_config('test.xp_e1', j ->> 'id', false);
  begin perform public.finance_expense_record(tid, 0, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_AMOUNT_INVALID', 'T2 zero: ' || sqlerrm; end;
  begin perform public.finance_expense_record(tid, 100.5, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_AMOUNT_INVALID', 'T2 fraction: ' || sqlerrm; end;
  begin perform public.finance_expense_record(gen_random_uuid(), 1000, null); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_TYPE_REQUIRED', 'T2 type: ' || sqlerrm; end;
  begin perform public.finance_expense_record(tid, 5000000, 'أكبر من الرصيد'); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_INSUFFICIENT', 'T2 insufficient: ' || sqlerrm; end;
  assert app.treasury_balance() = b0 - 150000, 'T2 balance unchanged after failures';
  raise notice 'T2 ✅ مصروف 150,000 خُصم فوراً · الرصيد % · الأخطاء تُرفض', app.treasury_balance();
end $$;

-- ═══ T3 · إلغاء مصروف بسبب ⇒ ملغى ويعود المبلغ؛ لا إلغاء بلا سبب؛ لا إلغاء مرتين؛ المؤكَّد من غير المصاريف لا يمرّ من هنا ═══
do $$ declare j jsonb; b0 numeric := current_setting('test.xp_bal0')::numeric; eid uuid := current_setting('test.xp_e1')::uuid; begin
  begin perform public.finance_expense_cancel(eid, ''); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_REASON_REQUIRED', 'T3 reason: ' || sqlerrm; end;
  begin perform public.finance_expense_cancel(current_setting('test.xp_rc')::uuid, 'ليس مصروفاً'); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_KIND_INVALID', 'T3 kind: ' || sqlerrm; end;
  j := public.finance_expense_cancel(eid, 'سُجّل بالخطأ — المبلغ الصحيح 15,000');
  assert j ->> 'status' = 'cancelled' and j ->> 'cancel_reason' like 'سُجّل بالخطأ%' and j ->> 'cancelled_by_name' is not null, 'T3 cancelled: ' || j::text;
  assert app.treasury_balance() = b0, 'T3 balance restored: ' || app.treasury_balance();
  begin perform public.finance_expense_cancel(eid, 'مرة ثانية'); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_NOT_CONFIRMED', 'T3 twice: ' || sqlerrm; end;
  perform public.finance_expense_record(current_setting('test.xp_t1')::uuid, 15000, 'التصحيح');
  raise notice 'T3 ✅ الإلغاء بسبب أعاد المبلغ · ثم تسجيل 15,000';
end $$;

-- ═══ T4 · أمر شراء صيانة ⇒ حركة «بانتظار المالية» بمبلغه تلقائياً + إشعار المالية؛ القطع تدخل المخزون كما كان ═══
select auth.set_test_user('db000000-0000-0000-0000-000000000004');
do $$ declare o public.maintenance_purchase_orders; t public.treasury_transactions; n int; begin
  o := public.maintenance_purchase_create('xp مورد', 'قطع عاجلة', '[{"part_category":"mechanical","item_name":"xp فلتر زيت","quantity":4,"unit":"قطعة","unit_price":25000},{"part_category":"electrical","item_name":"xp بطارية","quantity":1,"unit":"قطعة","unit_price":180000}]'::jsonb);
  assert o.total_amount = 280000 and o.item_count = 2, 'T4 order total: ' || o.total_amount;
  select * into t from public.treasury_transactions where purchase_order_id = o.id;
  assert found and t.kind = 'purchase' and t.status = 'pending' and t.amount = 280000 and t.affects_balance and t.type_name = 'مشتريات صيانة — ' || o.order_number
     and t.details like 'المورد: xp مورد · 2 بند · قطع عاجلة' and t.created_by = 'db000000-0000-0000-0000-000000000004' and t.expense_type_id = (select id from public.treasury_expense_types where is_system), 'T4 tx: ' || coalesce(t.details, 'null');
  select count(*) into n from public.notifications where user_id = 'db000000-0000-0000-0000-000000000002' and title = 'أمر شراء صيانة بانتظار التسليم' and body like '%' || o.order_number || ' · 280,000 د.ع%'; assert n = 1, 'T4 finance notified: ' || n;
  assert (select current_quantity from public.maintenance_inventory_items where item_name = 'xp فلتر زيت') = 4, 'T4 inventory';
  perform set_config('test.xp_po', o.id::text, false); perform set_config('test.xp_ptx', t.id::text, false);
  -- تدقيق المدخلات: كمية فارغة / سعر نصي / كمية خيالية ⇒ خطأ واضح ولا أمر
  begin perform public.maintenance_purchase_create(null, null, '[{"part_category":"other","item_name":"بلا كمية","unit_price":10}]'::jsonb); raise exception 'should fail'; exception when others then assert sqlerrm = 'MAINTENANCE_PURCHASE_ITEM_INVALID', 'T4 null qty: ' || sqlerrm; end;
  begin perform public.maintenance_purchase_create(null, null, '[{"part_category":"other","item_name":"سعر نصي","quantity":1,"unit_price":"abc"}]'::jsonb); raise exception 'should fail'; exception when others then assert sqlerrm = 'MAINTENANCE_PURCHASE_ITEM_INVALID', 'T4 text price: ' || sqlerrm; end;
  begin perform public.maintenance_purchase_create(null, null, '[{"part_category":"other","item_name":"كمية خيالية","quantity":99999999,"unit_price":1}]'::jsonb); raise exception 'should fail'; exception when others then assert sqlerrm = 'MAINTENANCE_PURCHASE_ITEM_INVALID', 'T4 huge: ' || sqlerrm; end;
  assert (select count(*) from public.maintenance_purchase_orders where supplier_name is null and created_by = 'db000000-0000-0000-0000-000000000004') = 0, 'T4 no partial orders';
  raise notice 'T4 ✅ أمر % ⇒ حركة معلّقة 280,000 · المدخلات الخاطئة تُرفض بوضوح', o.order_number;
end $$;

-- ═══ T5 · المالية: القائمة بحالة الدفع، «تم التسليم» يخصم من القاصة ويبلّغ صاحب الأمر، الرصيد غير الكافي يمنع، الإعادة بسبب تبلّغه ═══
select auth.set_test_user('db000000-0000-0000-0000-000000000002');
do $$ declare j jsonb; b numeric := app.treasury_balance(); n int; po uuid := current_setting('test.xp_po')::uuid; ptx uuid := current_setting('test.xp_ptx')::uuid; o2 public.maintenance_purchase_orders; begin
  select count(*) into n from public.maintenance_purchases_finance(null, null, 'xp') f where f.order_id = po and f.treasury_status = 'pending' and f.order_total = 280000 and f.treasury_ref like 'TR-%' and f.treasury_tx_id = ptx;
  assert n = 2, 'T5 finance list rows with status: ' || n;
  j := public.finance_treasury_confirm(ptx, 'سُلّم نقداً للصيانة');
  assert j ->> 'status' = 'confirmed' and j ->> 'finance_note' = 'سُلّم نقداً للصيانة', 'T5 confirm: ' || j::text;
  assert app.treasury_balance() = b - 280000, 'T5 balance: ' || app.treasury_balance();
  select count(*) into n from public.notifications where user_id = 'db000000-0000-0000-0000-000000000004' and title = 'سلّمت المالية مبلغ أمر الشراء' and link = '/maintenance/purchases' and body like '%280,000 د.ع%'; assert n = 1, 'T5 maintenance notified: ' || n;
  assert (select treasury_status from public.maintenance_purchases_finance(null, null, 'xp فلتر') limit 1) = 'confirmed', 'T5 list confirmed';
  -- أمر ثانٍ أكبر من الرصيد ⇒ التسليم ممنوع، ثم إعادة بسبب
  perform auth.set_test_user('db000000-0000-0000-0000-000000000004');
  o2 := public.maintenance_purchase_create('xp مورد 2', null, '[{"part_category":"bodywork","item_name":"xp صاج","quantity":1,"unit":"لوح","unit_price":9000000}]'::jsonb);
  perform auth.set_test_user('db000000-0000-0000-0000-000000000002');
  begin perform public.finance_treasury_confirm((select id from public.treasury_transactions where purchase_order_id = o2.id), null); raise exception 'should fail'; exception when others then assert sqlerrm = 'TREASURY_INSUFFICIENT', 'T5 insufficient: ' || sqlerrm; end;
  j := public.treasury_cancel((select id from public.treasury_transactions where purchase_order_id = o2.id), 'الرصيد لا يكفي — يُؤجَّل');
  assert j ->> 'status' = 'cancelled', 'T5 cancel';
  select count(*) into n from public.notifications where user_id = 'db000000-0000-0000-0000-000000000004' and title like 'أعادت المالية الحركة%' and body like '%الرصيد لا يكفي%'; assert n = 1, 'T5 cancel notified maintenance: ' || n;
  raise notice 'T5 ✅ تم التسليم خصم 280,000 وبلّغ الصيانة · الرصيد غير الكافي يمنع · الإعادة بسبب تبلّغ';
end $$;

-- ═══ T6 · ملخّص القاصة وقائمة الحركات: مفاتيح المصاريف والمشتريات، الرصيد = 1,000,000 − 15,000 − 280,000؛ الاحتفاظ والصلاحيات ═══
do $$ declare j jsonb; n int; begin
  j := public.treasury_summary(null, null);
  assert (j ->> 'balance')::numeric = 1000000 - 15000 - 280000, 'T6 balance: ' || (j ->> 'balance');
  assert (j -> 'range' ->> 'expenses_confirmed')::numeric = 15000 and (j -> 'range' ->> 'expenses_count')::int = 1 and (j -> 'range' ->> 'purchases_confirmed')::numeric = 280000 and (j -> 'range' ->> 'purchases_pending')::numeric = 0, 'T6 range: ' || (j -> 'range')::text;
  assert (select count(*) from jsonb_array_elements(j -> 'expenses_by_type') e where e ->> 'name' = 'مصاريف إنترنت' and (e ->> 'confirmed')::numeric = 15000) = 1, 'T6 expenses_by_type: ' || (j -> 'expenses_by_type')::text;
  assert (j -> 'by_month' -> 0 ->> 'expenses')::numeric = 15000 and (j -> 'by_month' -> 0 ->> 'purchases')::numeric = 280000, 'T6 by_month: ' || (j -> 'by_month')::text;
  select count(*) into n from jsonb_array_elements(public.treasury_list(null, null, 'expense', null, null, null, null, 100)) e where e ->> 'kind' = 'expense'; assert n = 2, 'T6 list expense (1 confirmed + 1 cancelled): ' || n;
  select count(*) into n from jsonb_array_elements(public.treasury_list(null, null, 'purchase', 'pending', null, null, null, 100)); assert n = 0, 'T6 no pending purchases';
  assert exists (select 1 from app.data_retention_catalog() c where c.table_name = 'treasury_expense_types' and not c.deletable), 'T6 retention';
  assert exists (select 1 from public.permission_units where key = 'finance.expenses' and 'create' = any(actions)), 'T6 perm unit';
  raise notice 'T6 ✅ الملخّص والقائمة والاحتفاظ والصلاحيات';
end $$;
reset role; select set_config('auth.user_id','', false);
