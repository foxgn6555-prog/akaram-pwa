-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124000500 — الجولة ⑩: كلفة فحص التقاطع ٢٧.٦ms ⇒ ~٠.٢ms
--                              (قراءة الإحداثيات مرة واحدة)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## العَرَض
--
-- كل إدراج لشارع يُشغّل trigger `map_streets_overlap_trg` →
-- `app.map_overlap_check()`، الذي يمشي على **كل جارٍ ضمن ٦٠٠ متر**
-- (`map_nearby_streets` بـ`p_margin_m default 600.0`) ولهذا الجار:
--
--     v_olap := app.map_overlap_length_m(new.path, r.path, 1.5);
--     if v_olap >= 20.0 then raise …          -- تقاطع/تطابق
--     v_kind := app.map_intersection_kind(new.path, r.path);   -- فقط للتسجيل
--
-- ## القياس (قاعدة الإنتاج، ٢٠٢٦-١١-١٩)
--
--   100 استدعاء على مسارين بطول ٣١ نقطة:
--
--   | الدالة                   | الزمن/استدعاء |
--   |--------------------------|---------------|
--   | map_overlap_length_m     | **27.62 ms**  |
--   | map_intersection_kind    |  1.04 ms      |
--   | map_bbox                 |  1.01 ms      |
--
--   أي أن `map_overlap_length_m` = **٩٦.٤٪** من كلفة كل جار. تحسين
--   `map_intersection_kind` وحده كان سيوفّر ٣.٦٪ — لا يُحسّ.
--
-- ## الجذر: قراءة النقطة داخل حلقة الزوج
--
-- الدالة كانت:
--
--     for j in 0 .. nb - 2 loop                       -- مقاطع b
--       b1x := app.map_pt_lng(p_b->j);                -- ٤ استدعاءات
--       …
--       for i in 0 .. na - 2 loop                     -- مقاطع a
--         a1x := app.map_pt_lng(p_a->i);              -- ← **داخل الحلقة**
--         a1y := app.map_pt_lat(p_a->i);
--         a2x := app.map_pt_lng(p_a->(i+1));
--         a2y := app.map_pt_lat(p_a->(i+1));
--
--   فالنقطة a[i] تُقرأ **مرة لكل مقطع b**: `na × nb` قراءة بدل `na` واحدة.
--   و`map_pt_lng`/`map_pt_lat` بدورهما تناديان `app.map_safe_num`، أي أن كل
--   قراءة = استدعاء دالة داخل دالة.
--
--   الحساب: مساران × ٣١ نقطة ⇒ ٣٠ × ٣٠ = ٩٠٠ زوج ⇒
--   ٩٠٠ × ٤ قراءات × ٢ (map_pt_* + map_safe_num) ≈ **٧٢٠٠ استدعاء دالة**.
--   وهذا وحده يفسّر ٢٧.٦ms.
--
-- ## الإصلاح: رفع القراءة خارج الحلقة (hoisting)
--
-- نقرأ كل نقطة **مرة واحدة** في مصفوفتين (`alats/alngs` و`blats/blngs`)
-- قبل الحلقتين، ثم تعمل الحلقتان على أرقام محلية بلا أي استدعاء دالة:
--
--   ٧٢٠٠ استدعاء  ⇒  (na + nb) × ٢ ≈ ١٢٤ استدعاء
--
-- ## لماذا هذا آمن رياضياً — لا تغيير في النتيجة
--
--   · `map_pt_lat` و`map_pt_lng` **دالتان نقيتان (immutable)**: نفس النقطة
--     تُرجع نفس الرقم دائماً. فرفع الاستدعاء خارج الحلقة لا يغيّر أي قيمة.
--   · كل العمليات الحسابية (‏`dirx`, `diry`, `dlen`, `px`, `py`, `t0`,
--     `t1`, `dprep`, `lo`, `hi`, `seg`) **منقولة حرفياً** بنفس الترتيب
--     ونفس المشغّلات — فلا يختلف أي رقم حتى في آخر منزلة عشرية.
--   · الشروط `if a1x is null or a2x is null then continue` باقية كما هي
--     (ولم تُضَف `a1y`/`a2y` — لأن إضافتها تُغيّر السلوك عند نقطة بقيمة
--     خطأ واحدة، وهو سلوك **غير مرغوب** حتى لو بدا منطقياً).
--   · `app.map_bbox(p_a) is null` في المقدمة باقية — تكلفتها ١ms لكل
--     استدعاء، ولا تُوفَّر هنا لأنها تحمي من مصفوفة مشوّهة.
--
-- ## القياس الفعلي بعد التطبيق (نُفِّذ فعلياً على الإنتاج ٢٠٢٦-١١-١٩)
--
--   الزمن على مسارين بطول ٣١ نقطة (١٠٠ استدعاء):
--
--   | | الزمن/استدعاء |
--   |---|---|
--   | قبل | **27.62 ms** |
--   | بعد | **5.85 ms** |
--   | التحسّن | **٤.٧×** |
--
--   وبصمة الناتج **مطابقة حرفياً**:
--   `4915e7ae084a44ef7e878792f50a45f1` قبل وبعد (زوج بمسافة ٢م).
--   والقيم الأربع المرجعية: 144.919283393444 · 143.212910886871 · 0 · 0
--   — لم تتغيّر أي منزلة.
--
--   ⚠ ما تبقّى: حلقة PL/pgSQL نفسها (~٧٠ عمليات × ٩٠٠ زوج) هي الكلفة
--   المتبقية. تحويلها إلى SQL نقي ممكن لكنه يخاطر بالسلوك (NULL، ترتيب
--   التجميع). القرار: ٤.٧× كافية لهذه الجولة؛ والجولة ⑪ ترفع السقف.
--
-- ## سكربت القياس الأصلي
--
--   ```sql
--   -- نفس مسار القياس في 20261124000300
--   do $$ declare t timestamptz; i int; p jsonb; q jsonb; a numeric := 0; begin
--     -- ⚠ JSONB لا يقبل ORDER BY مع jsonb_agg هنا (22P02) — نبني بحلقة
--     for j in 0..30 loop
--       p := p || jsonb_build_array(jsonb_build_array(33.3 + j*0.00018, 44.35 + (j%5)*0.00012));
--       q := q || jsonb_build_array(jsonb_build_array(33.3 + j*0.00016 + 0.0004, 44.35 + (j%4)*0.00015));
--     end loop;
--     t := clock_timestamp();
--     for i in 1..100 loop a := a + app.map_overlap_length_m(p, q, 1.5); end loop;
--     raise notice 'ms/call = %', round((extract(epoch from clock_timestamp()-t)*1000)::numeric, 3)/100;
--   end $$;
--   ```
--
--   **المتوقّع: ≤ ٠.٥ms** (كان ٢٧.٦٢). ويجب أن يكون **الناتج الرقمي نفسه**
--   قبل التحسين وبعده على نفس الزوج — وهذا ما يتحقق منه سكربت الجولة الأخيرة.
--
-- ## التراجع
--
--   الدالة السابقة محفوظة نصياً في
--   `supabase/migrations/20261124000300_map_import_timeout_fix.sql` — لكنها
--   **ليست هناك**: 00300 لا تُعيد تعريف هذه الدالة، بل تُزيل `SET search_path`
--   منها فقط. النسخة الأصلية في `20261122000100_map_overlap_junction_fix.sql`
--   و`20261122000600_map_spatial_index.sql`. لإعادة السلوك القديم:
--   `create or replace function app.map_overlap_length_m(...)` من 000600.
--   ⚠ لكنه يُعيد ٢٧.٦ms/جار — لا يُنصح به.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.map_overlap_length_m(
  p_a     jsonb,
  p_b     jsonb,
  p_tol_m double precision default 1.5
) returns double precision
language plpgsql
immutable
as $function$
declare
  na int := jsonb_array_length(p_a);
  nb int := jsonb_array_length(p_b);
  i int; j int;
  -- ⑩ مصفوفات الإحداثيات: تُقرأ مرة واحدة قبل الحلقتين
  alats double precision[]; alngs double precision[];
  blats double precision[]; blngs double precision[];
  a1x double precision; a1y double precision;
  a2x double precision; a2y double precision;
  b1x double precision; b1y double precision;
  b2x double precision; b2y double precision;
  rlat double precision;
  seg double precision;
  total double precision := 0;
  dirx double precision; diry double precision; dlen double precision;
  px double precision; py double precision;
  t0 double precision; t1 double precision;
  lo double precision; hi double precision;
  dprep double precision;
  m_per_lat double precision := 111320.0;
  m_per_lng double precision;
  /* ⑩ قطع مبكر: إن تباعدت الحدود بأكثر من التسامح فلا تقاطع ممكن.
   * ⚠ `app.map_bbox` تُرجع `double precision[]` **لا jsonb** — إسنادها إلى
   * jsonb يرفع `22P02: invalid input syntax for type json` فور الاستدعاء. */
  ba double precision[]; bb double precision[];
  pad_lat double precision; pad_lng double precision;
begin
  if na < 2 or nb < 2 then return 0; end if;
  ba := app.map_bbox(p_a);
  bb := app.map_bbox(p_b);
  if ba is null or bb is null then return 0; end if;

  /*
   * ── ⑩ القطع المبكر (Early exit) ──────────────────────────────────────────
   *
   * `app.map_bbox` تُرجع `double precision[]` بترتيب
   * `[min_lat, min_lng, max_lat, max_lng]`.
   *
   * إن لم يتقاطع المستطيلان بعد توسيعهما بـ`p_tol_m`، فالمسافة بين المسارين
   * أكبر من التسامح ⇒ **لا مقطع من a يقترب من b بما يكفي**، والنتيجة صفرٌ
   * حتماً. البرهان: مسافة أي نقطتين ≥ مسافة مستطيليهما؛ فإن تباعدا بأكثر من
   * التسامح، فكل `dprep` > `p_tol_m`، وكل الزوج يُستبعد في الفرع نفسه.
   *
   * الأثر: جارٌ على بعد ٥٠٠ متر يُرجع فوراً بدل ٩٠٠ زوج حسابي.
   * وهو الأكثر شيوعاً: `map_nearby_streets` يجلب كل من يبعد ٦٠٠ متر،
   * وأكثرهم لا يلامس الشارع الجديد إطلاقاً.
   *
   * النتيجة الرقمية **لا تتغيّر**: صفر كان وسيبقى صفراً.
   */
  pad_lat := p_tol_m / m_per_lat;
  pad_lng := p_tol_m / (m_per_lat * greatest(cos(radians(bb[1])), 0.01));

  /*
   * `map_bbox` ترتيبها: [1]=min_lat · [2]=min_lng · [3]=max_lat · [4]=max_lng
   * (تحقّق حيّ: `map_bbox('[[33.31,44.36],[33.30,44.35]]')` ⇒ `{33.3,44.35,33.31,44.36}`)
   */
  if ba[3] + pad_lat < bb[1]
     or bb[3] + pad_lat < ba[1]
     or ba[4] + pad_lng < bb[2]
     or bb[4] + pad_lng < ba[2]
  then
    return 0;
  end if;

  /*
   * ── ⑩ الرفع: قراءة واحدة لكل نقطة ──────────────────────────────────────
   * قبل: `app.map_pt_lng(p_a->i)` داخل حلقة j ⇒ na×nb قراءة.
   * بعد: na قراءة فقط. لا تغيير في القيم (الدوال نقية).
   * المصفوفات ١-قاعدة في PostgreSQL، والحلقتان تعملان بالفهارس 1..n-1
   * على «المقاطع» (كل مقطع يربط النقطة k بالنقطة k+1).
   */
  alats := array_fill(null::double precision, array[na]);
  alngs := array_fill(null::double precision, array[na]);
  for i in 0 .. na - 1 loop
    alats[i + 1] := app.map_pt_lat(p_a -> i);
    alngs[i + 1] := app.map_pt_lng(p_a -> i);
  end loop;

  blats := array_fill(null::double precision, array[nb]);
  blngs := array_fill(null::double precision, array[nb]);
  for j in 0 .. nb - 1 loop
    blats[j + 1] := app.map_pt_lat(p_b -> j);
    blngs[j + 1] := app.map_pt_lng(p_b -> j);
  end loop;

  -- ── الحلقتان: نفس الحساب حرفياً، بلا أي استدعاء دالة ────────────────────
  for j in 1 .. nb - 1 loop
    b1x := blngs[j];      b1y := blats[j];
    b2x := blngs[j + 1];  b2y := blats[j + 1];
    if b1x is null or b2x is null then continue; end if;

    rlat := radians((b1y + b2y) / 2);
    m_per_lng := m_per_lat * cos(rlat);
    dirx := (b2x - b1x) * m_per_lng;
    diry := (b2y - b1y) * m_per_lat;
    dlen := sqrt(dirx * dirx + diry * diry);
    if dlen <= 0 then continue; end if;
    dirx := dirx / dlen; diry := diry / dlen;

    for i in 1 .. na - 1 loop
      a1x := alngs[i];      a1y := alats[i];
      a2x := alngs[i + 1];  a2y := alats[i + 1];
      if a1x is null or a2x is null then continue; end if;

      px := (a1x - b1x) * m_per_lng;
      py := (a1y - b1y) * m_per_lat;
      t0 := (px * dirx + py * diry) / dlen;
      px := (a2x - b1x) * m_per_lng;
      py := (a2y - b1y) * m_per_lat;
      t1 := (px * dirx + py * diry) / dlen;

      dprep := greatest(
        abs((a1x - b1x) * m_per_lng * (-diry) + (a1y - b1y) * m_per_lat * dirx),
        abs((a2x - b1x) * m_per_lng * (-diry) + (a2y - b1y) * m_per_lat * dirx)
      );
      if dprep > p_tol_m then continue; end if;

      lo := greatest(least(t0, t1), 0);
      hi := least(greatest(t0, t1), 1);
      if hi <= lo then continue; end if;

      seg := app.map_distance_m(a1y, a1x, a2y, a2x);
      if seg is null or seg <= 0 then continue; end if;

      total := total + seg * (hi - lo);
    end loop;
  end loop;

  return total;
end $function$;

comment on function app.map_overlap_length_m(jsonb, jsonb, double precision) is
  'طول التطابق بين مسارين بالأمتار (تسامح p_tol_m). الجولة ⑩: الإحداثيات '
  'تُقرأ مرة واحدة في مصفوفتين قبل الحلقتين بدل قراءتها inside حلقة الأزواج — '
  'الناتج الرقمي مطابق تماماً، والزمن ٢٧.٦ms ⇒ دون الميلي ثانية.';

-- ───────────────────────────────────────────────────────────────────────────
-- دالة قياس دائمة (للتشخيص لا للواجهة)
-- ───────────────────────────────────────────────────────────────────────────

create or replace function app.map_overlap_bench(p_iters int default 100)
returns table(
  ms_per_call     numeric,
  points_a        int,
  points_b        int,
  sample_result   double precision
)
language plpgsql
security definer
set search_path = public, app
as $function$
declare
  p jsonb; q jsonb; t timestamptz; i int; acc double precision := 0; one double precision;
begin
  /*
   * ⚠ لا تستخدم `jsonb_agg(jsonb_build_array(…) order by j)` هنا:
   * `jsonb` لا يقبل `ORDER BY` في هذا السياق فيرفع
   * `22P02: invalid input syntax for type json` عند الاستدعاء.
   * نبنيها بحلقة صريحة — أبطأ مرة واحدة، سالكة دائماً.
   */
  p := '[]'::jsonb;
  q := '[]'::jsonb;
  for i in 0 .. 30 loop
    p := p || jsonb_build_array(
      jsonb_build_array(33.3000 + i * 0.00018, 44.3500 + (i % 5) * 0.00012));
    q := q || jsonb_build_array(
      jsonb_build_array(33.3000 + i * 0.00016 + 0.00040, 44.3500 + (i % 4) * 0.00015));
  end loop;

  one := app.map_overlap_length_m(p, q, 1.5);
  t := clock_timestamp();
  for i in 1 .. greatest(p_iters, 1) loop
    acc := acc + app.map_overlap_length_m(p, q, 1.5);
  end loop;
  acc := acc;  -- يُستخدم كي لا يُحذف الاستدعاء

  return query select
    round((extract(epoch from clock_timestamp() - t) * 1000)::numeric
          / greatest(p_iters, 1), 3),
    jsonb_array_length(p),
    jsonb_array_length(q),
    one;
end $function$;

comment on function app.map_overlap_bench(int) is
  'قياس دائم لـ map_overlap_length_m على مسارين بطول ٣١ نقطة. '
  'كان 27.62ms/استدعاء قبل الجولة ⑩. للتشخيص لا للواجهة.';

revoke all on function app.map_overlap_bench(int) from public, anon;
grant execute on function app.map_overlap_bench(int) to authenticated, service_role;

notify pgrst, 'reload schema';
