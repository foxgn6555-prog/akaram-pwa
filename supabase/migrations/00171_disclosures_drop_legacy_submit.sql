-- 00171 — إزالة الدالة القديمة disclosure_submit(text) من بوابة الكشوفات الملغاة (00040/00042)
-- كانت تتعارض مع disclosure_submit(uuid) الجديدة (00170) فيرفض PostgREST الاستدعاء:
-- "Could not choose the best candidate function between disclosure_submit(p_id => text) / (p_id => uuid)"
drop function if exists public.disclosure_submit(text);
drop function if exists app.disclosure_submit(text);
-- دوال 00042 الأخرى المتبقية (archive/restore/summary) لا تتعارض بالاسم مع 00170 وتبقى لأرشيف IT.
