-- depends: tests/db/unmatched-archive-foundation-test.sql
set role authenticated;
select set_config('auth.user_id','b8030000-0000-0000-0000-000000000001',false);
do $$ begin
 if (public.unmatched_unit_my_access()->>'can_edit')::boolean then raise exception 'HR بدأ بصلاحية التعديل'; end if;
 begin perform public.unmatched_unit_person_edit('ARC-D1','811','اسم جديد',0); raise exception 'سمح لغير المخول بالتعديل';
 exception when others then if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if; end;
 begin perform public.unmatched_unit_set_hr_permission('b8030000-0000-0000-0000-000000000001',true); raise exception 'HR منح نفسه الصلاحية';
 exception when others then if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if; end;
end $$;
select set_config('auth.user_id','b8030000-0000-0000-0000-000000000002',false);
do $$ declare n int; begin
 if not (public.unmatched_unit_my_access()->>'can_edit')::boolean then raise exception 'IT لا يستطيع التعديل'; end if;
 select count(*) into n from public.unmatched_unit_hr_permissions() where user_id='b8030000-0000-0000-0000-000000000001' and not can_edit;
 if n<>1 then raise exception 'قائمة صلاحيات HR غير صحيحة'; end if;
 perform public.unmatched_unit_set_hr_permission('b8030000-0000-0000-0000-000000000001',true);
end $$;
select set_config('auth.user_id','b8030000-0000-0000-0000-000000000001',false);
do $$ declare j jsonb; n int; begin
 if not (public.unmatched_unit_my_access()->>'can_edit')::boolean then raise exception 'لم تطبق الصلاحية'; end if;
 j:=public.unmatched_unit_person_edit('ARC-D1','811','اسم يدوي',0);
 if j->>'display_name'<>'اسم يدوي' or (j->>'revision')::int<>1 then raise exception 'تعديل الاسم فشل %',j; end if;
 j:=public.unmatched_unit_day_edit('ARC-D1','811','2025-05-01','present','16:00','03:00',true,0);
 if j->>'status'<>'present' or (j->>'revision')::int<>1 then raise exception 'اليوم فشل %',j; end if;
 j:=public.unmatched_unit_day_edit('ARC-D1','811','2025-05-02','leave',null,null,false,0);
 if j->>'status'<>'leave' then raise exception 'الإجازة فشلت'; end if;
 j:=public.unmatched_unit_edits('ARC-D1','811','2025-05-01','2025-05-02');
 if j->'person'->>'display_name'<>'اسم يدوي' or jsonb_array_length(j->'days')<>2 then raise exception 'لم تقرأ التعديلات %',j; end if;
 select count(*) into n from public.unmatched_unit_history('ARC-D1','811') where action in ('name','day');
 if n<>3 then raise exception 'سجل التعديلات غير مكتمل %',n; end if;
 begin perform public.unmatched_unit_person_edit('ARC-D1','811','تعديل قديم',0); raise exception 'قُبلت نسخة قديمة';
 exception when others then if sqlerrm not like '%BIO_EDIT_CONFLICT%' then raise; end if; end;
 begin perform public.unmatched_unit_day_edit('ARC-D1','811',current_date+2,'absent',null,null,false,0); raise exception 'سمح بغياب المستقبل';
 exception when others then if sqlerrm not like '%BIO_ABSENCE_NOT_PAST%' then raise; end if; end;
 begin perform public.unmatched_unit_day_edit('ARC-D1','811','2025-05-03','present','14:00','08:01',true,0); raise exception 'قبل أكثر من 16 ساعة';
 exception when others then if sqlerrm not like '%BIO_EDIT_NEEDS_REVIEW%' then raise; end if; end;
 perform public.unmatched_unit_day_edit('ARC-D1','811','2025-05-03','review','14:00','08:01',true,0);
 if public.unmatched_unit_edits('ARC-D2','811','2025-05-01','2025-05-02')->'person' <> 'null'::jsonb then raise exception 'اختلط الجهازان'; end if;
end $$;
reset role;
do $$ declare j jsonb; n int; begin
 select original_punch into j from public.unmatched_archive_punches where source_punch_id='c8030000-0000-0000-0000-000000000001';
 if j->>'person_name'<>'اسم أول' or j->'raw'->>'raw'<>'original' then raise exception 'التعديل مس البصمة الأصلية'; end if;
 select count(*) into n from public.biometric_punches where pin='811' and employee_id='e8030000-0000-0000-0000-000000000001';
 if n<>2 then raise exception 'التعديل مس الربط الرسمي %',n; end if;
end $$;
set role authenticated; select set_config('auth.user_id','b8030000-0000-0000-0000-000000000002',false);
select public.unmatched_unit_set_hr_permission('b8030000-0000-0000-0000-000000000001',false);
select set_config('auth.user_id','b8030000-0000-0000-0000-000000000001',false);
do $$ begin
 begin perform public.unmatched_unit_day_edit('ARC-D1','811','2025-05-02','absent',null,null,false,1); raise exception 'سحب الصلاحية فشل';
 exception when others then if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if; end;
end $$;
reset role; select set_config('auth.user_id','',false);
