-- 00238 — إصلاح رصيد القاصة: 00203 أعاد تعريف treasury_summary انطلاقاً من نسخة 00189 ففقد إضافات 00191 (السلف):
-- كانت تسديدات السلف النقدية (advance_repayment) تُطرح من الرصيد بدل أن تُضاف، واختفت مفاتيح
-- advances_confirmed / advance_repayments / by_month.advances. هذه النسخة = 00203 (قيود المعاون) + 00191 (السلف).
create or replace function public.treasury_summary(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare v_full boolean := app.has_role(array['executive_director','finance_officer','super_admin']); j jsonb;
begin
  if not (v_full or app.has_role(array['deputy_director'])) then raise exception 'EXEC_FORBIDDEN'; end if;
  j := (
    with r as (select * from public.treasury_transactions x
               where (p_from is null or (x.created_at at time zone 'Asia/Baghdad')::date >= p_from) and (p_to is null or (x.created_at at time zone 'Asia/Baghdad')::date <= p_to))
    select jsonb_build_object(
      -- الرصيد الكلي (لا يتأثر بالفلتر): المستلَم المؤكَّد + تسديدات السلف النقدية − المكافآت النقدية − تسديدات GPS − السلف المسلَّمة
      'balance', (select coalesce(sum(case when kind in ('receipt','advance_repayment') then amount else -amount end), 0) from public.treasury_transactions where status = 'confirmed' and affects_balance),
      'frozen', (select coalesce(sum(amount), 0) from public.treasury_transactions where status = 'pending' and kind = 'receipt'),
      'pending_out', (select coalesce(sum(amount), 0) from public.treasury_transactions where status = 'pending' and kind <> 'receipt'),
      'pending_count', (select count(*) from public.treasury_transactions where status = 'pending'),
      'range', jsonb_build_object(
        'receipts_confirmed', (select coalesce(sum(amount), 0) from r where kind = 'receipt' and status = 'confirmed'),
        'receipts_pending', (select coalesce(sum(amount), 0) from r where kind = 'receipt' and status = 'pending'),
        'rewards_cash_confirmed', (select coalesce(sum(amount), 0) from r where kind = 'reward' and reward_type = 'cash' and status = 'confirmed'),
        'rewards_count', (select count(*) from r where kind = 'reward' and status <> 'cancelled'),
        'gps_confirmed', (select coalesce(sum(amount), 0) from r where kind = 'gps_payment' and status = 'confirmed'),
        'gps_pending', (select coalesce(sum(amount), 0) from r where kind = 'gps_payment' and status = 'pending'),
        'advances_confirmed', (select coalesce(sum(amount), 0) from r where kind = 'advance' and status = 'confirmed'),
        'advance_repayments', (select coalesce(sum(amount), 0) from r where kind = 'advance_repayment' and status = 'confirmed'),
        'count', (select count(*) from r)),
      'by_type', (select coalesce(jsonb_agg(jsonb_build_object('type_id', type_id, 'name', type_name, 'confirmed', c, 'pending', p, 'count', n) order by c desc), '[]'::jsonb)
                  from (select type_id, type_name, coalesce(sum(amount) filter (where status = 'confirmed'), 0) c, coalesce(sum(amount) filter (where status = 'pending'), 0) p, count(*) n from r where kind = 'receipt' group by type_id, type_name) q),
      'rewards_by_type', (select coalesce(jsonb_object_agg(reward_type, n), '{}'::jsonb) from (select reward_type, count(*) n from r where kind = 'reward' and status <> 'cancelled' group by reward_type) q),
      'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'receipts', rc, 'rewards', rw, 'gps', g, 'advances', adv) order by m), '[]'::jsonb)
                   from (select to_char(created_at at time zone 'Asia/Baghdad', 'YYYY-MM') m,
                                coalesce(sum(amount) filter (where kind = 'receipt' and status = 'confirmed'), 0) rc,
                                coalesce(sum(amount) filter (where kind = 'reward' and status = 'confirmed'), 0) rw,
                                coalesce(sum(amount) filter (where kind = 'gps_payment' and status = 'confirmed'), 0) g,
                                coalesce(sum(amount) filter (where kind = 'advance' and status = 'confirmed'), 0) adv
                         from r group by 1) q)));
  -- 00203: معاون المدير المفوض يرى أرقام المكافآت فقط (لا رصيد القاصة ولا المستحقات)
  if not v_full then
    j := jsonb_build_object('rewards_by_type', j -> 'rewards_by_type',
      'range', jsonb_build_object('rewards_count', j -> 'range' -> 'rewards_count', 'rewards_cash_confirmed', j -> 'range' -> 'rewards_cash_confirmed'));
  end if;
  return j;
end$$;
