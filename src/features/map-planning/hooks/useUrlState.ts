/**
 * حالة مرشّح محفوظة في عنوان الصفحة — للمشاركة والرجوع.
 *
 * ## لماذا العنوان لا `useState` فقط
 * شكوى متكرّرة: «أرسل لي الرابط الذي تُظهر فيه هذه الزيارات». بحالة داخلية
 * يصير الرابط دائماً الصفحة الافتراضية، فيصل المُرسَل إليه إلى شاشة أخرى.
 * وثانياً زرّ الرجوع في المتصفّح يجب أن يُرجع المرشّح السابق لا أن يخرج من
 * الصفحة — وهذا ما يوفّره العنوان أصلاً بلا كود إضافي.
 *
 * ## القرارات
 * ① **استبدال لا تراكم** (`replace: true`): تغيير المرشّح ليس تنقّلاً، ولو
 *    أضفنا سجلاً لكل ضغطة لاحتاج المستخدم عشرين ضغطة «رجوع» للخروج.
 *    التنقّل الحقيقي (اختيار صفحة) يبقى في السجل كما هو.
 * ② **القيمة الافتراضية تُحذف من العنوان** كي يبقى نظيفاً: `/visits` لا
 *    `/visits?day=2026-11-24&zone=…` حين لا يوجد مرشّح فعلي.
 * ③ **قيمة غير صالحة تُتجاهَل** وتعود للافتراضي — الرابط قد يأتي من نسخة
 *    قديمة أو من تحرير يدوي، فلا نُسقط الصفحة ولا نمرّر `NaN` إلى القاعدة.
 * ④ **حالة محلية للكتابة الفورية**: `setUrlState` تحدّث الحالة فوراً ثم
 *    العنوان، لأن `useSearchParams` قد يتأخّر إطاراً فيتقطّع مؤشّر الكتابة
 *    داخل حقل البحث. الحالة المحلية تُزامَن مع العنوان عند تغيّره من خارجه
 *    (زرّ الرجوع).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

type Options<T> = {
  /** القيمة الافتراضية — تُحذف من العنوان، وتُرجَع عند غياب/فساد القيمة */
  fallback: T
  /** يتحقق من قيمة العنوان ويحوّلها؛ يُرجع `undefined` إن كانت غير صالحة */
  parse: (raw: string) => T | undefined
  /** يحوّل القيمة إلى نصّ للعنوان */
  serialize?: (value: T) => string
}

const identity = (v: string) => v

/**
 * يقرأ ويكتب قيمة واحدة في `?key=` مع مزامنة كاملة.
 *
 * @param key اسم المعامل في العنوان
 * @param fallback القيمة الافتراضية
 * @param parse تحويل+تحقق من النصّ
 * @param serialize تحويل إلى نصّ (الافتراضي `String`)
 */
export function useUrlState<T>(
  key: string,
  { fallback, parse, serialize = String }: Options<T>,
): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams()

  const fromUrl = (): T => {
    const raw = params.get(key)
    if (raw === null || raw === '') return fallback
    const parsed = parse(raw)
    return parsed === undefined ? fallback : parsed
  }

  const [value, setValue] = useState<T>(fromUrl)
  /** آخر نصّ كتبناه نحن — لتمييز تغيّر العنوان من الخارج عن تغيّرنا */
  const lastWritten = useRef<string | null>(params.get(key))

  // العنوان تغيّر من خارجه (رجوع/رابط جديد): نتبع العنوان لا الحالة المحلية
  useEffect(() => {
    const raw = params.get(key)
    if (raw === lastWritten.current) return
    lastWritten.current = raw
    const parsed = raw === null || raw === '' ? fallback : parse(raw)
    setValue(parsed === undefined ? fallback : parsed)
    // parse/fallback ثابتتان عملياً (تُعرَّف في أعلى المكوّن) — لا نُدرجهما
    // كتبعية كي لا تُعاد المزامنة عند كل تصيير وتُصفّر الحالة المحلية
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, key])

  const set = useCallback(
    (next: T) => {
      setValue(next)
      const text = serialize(next)
      const isDefault = text === '' || next === fallback
      const raw = isDefault ? null : text
      lastWritten.current = raw
      setParams(
        (prev) => {
          const copy = new URLSearchParams(prev)
          if (raw === null) copy.delete(key)
          else copy.set(key, raw)
          return copy
        },
        { replace: true },
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, fallback, serialize],
  )

  return [value, set]
}

/** مرشّح نصّي — الاختصار الأكثر استعمالاً (بحث/كود محلة) */
export function useUrlText(key: string, fallback = ''): [string, (v: string) => void] {
  return useUrlState<string>(key, { fallback, parse: identity })
}

/**
 * مرشّح منطقي (`true`/`false`) — يظهر في العنوان كـ`?k=1` فقط حين يكون `true`.
 * الافتراضي `false`: العنوان يبقى نظيفاً في الحالة الشائعة.
 */
export function useUrlBool(key: string): [boolean, (v: boolean) => void] {
  return useUrlState<boolean>(key, {
    fallback: false,
    parse: (raw) => (raw === '1' || raw === 'true' ? true : raw === '0' || raw === 'false' ? false : undefined),
    serialize: (v) => (v ? '1' : ''),
  })
}

/**
 * مرشّح من مجموعة قيم محدودة (تبويب/حالة/نوع).
 * `undefined` تُرجع للافتراضي وتُحذف من العنوان.
 */
export function useUrlChoice<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (v: T) => void] {
  return useUrlState<T>(key, {
    fallback,
    parse: (raw) => (allowed.includes(raw as T) ? (raw as T) : undefined),
  })
}
