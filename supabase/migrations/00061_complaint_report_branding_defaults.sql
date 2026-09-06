-- 00061 · تحديث القالب الرسمي بهوية الغلاف الجديدة مع إبقاء القوالب المخصصة دون تغيير.
update public.complaint_templates
set layout=layout||jsonb_build_object(
  'accent','#D269C8',
  'title','تقرير معالجة التلكؤات ليوم',
  'authorityLine','أمانة بغداد / دائرة بلدية الكرادة',
  'contractorLine','تحالف شركات جزيرة الأكرام وفيرست ترايد',
  'beforeLabel',coalesce(layout->>'beforeLabel','صورة التلكؤ'),
  'afterLabel',coalesce(layout->>'afterLabel','صورة المعالجة')
),updated_at=clock_timestamp()
where name='القالب الرسمي قبل وبعد';

-- المسودات غير المرسلة تستفيد من سطري الهوية عند إعادة التوليد، من دون مساس بعنوان خصصه الموظف.
update public.complaint_reports
set layout=layout||jsonb_build_object(
  'authorityLine',coalesce(layout->>'authorityLine','أمانة بغداد / دائرة بلدية الكرادة'),
  'contractorLine',coalesce(layout->>'contractorLine','تحالف شركات جزيرة الأكرام وفيرست ترايد')
)
where status in('draft','quality_review','failed');
