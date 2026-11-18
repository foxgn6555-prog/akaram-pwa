/**
 * بوابة الإعلام ← «التصاميم»: حلقة «هذا التصميم غير موجود أو حُذف» (فحص 2026-11-15).
 *
 * العطل: تأثير المحرر كان يعتمد على دالة `close` تُنشأ من جديد في كل رسم للصفحة، فيعيد التنفيذ (إشعار + تنقّل)
 * كلما أُعيد الرسم؛ والتنقّل يُعيد تشغيل loader الحارس فتُعاد الصفحة للرسم فيعيد التأثير التنقّل ... بلا نهاية
 * (≈200 إشعار و≈400 طلب في الثانية، والتنقّل مقفل). اختبار 00284 القديم لا يلتقطه لأنه يستعمل MemoryRouter بلا loader؛
 * هنا موجّه بيانات فعلي (createMemoryRouter) مع loader متأخر كما في التطبيق.
 *
 * القرار (المستخدم): بعد حذف كل الصور يبقى المحرر مفتوحاً فارغاً — «صفر صور» ليس «تصميماً غير موجود».
 *
 * ملاحظة أمان للاختبار نفسه: لو عادت الحلقة فلا يجوز أن يعلّق CI. القاطع في `useDesignDetail` أدناه يُستدعى في كل رسم
 * فيرمي بعد MAX_RENDERS فيتوقف كل شيء ويفشل الاختبار برسالة واضحة. (جُرّب قاطع على الإشعارات وآخر على loader فقط:
 * لا يكفيان — حلقة «حذف المسودة» بلا إشعارات، وأخطاء الـ loader تُهمَل لأن التنقّل يُلغى قبل تسليمها.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Outlet, RouterProvider, createMemoryRouter, useLocation } from 'react-router'

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  loader: vi.fn(),
  refetch: vi.fn(),
  del: vi.fn(),
  detail: {} as Record<string, unknown>,
  renders: 0,
  MAX_RENDERS: 400,
}))

vi.mock('@features/media/hooks', () => ({
  useDesigns: () => ({ data: [], isLoading: false }),
  useDesignDetail: () => {
    if (++h.renders > h.MAX_RENDERS) throw new Error('RUNAWAY: رسم بلا توقف — عادت حلقة التأثير↔التنقّل')
    return h.detail
  },
  useUpdateDesign: () => ({ mutate: vi.fn(), isPending: false }),
  useCompleteDesign: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveDesignPhoto: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveDesignPhotos: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveCoverToLibrary: () => ({ mutate: vi.fn(), isPending: false }),
  useSetDesignShift: () => ({ mutate: vi.fn(), isPending: false }),
  useMediaCovers: () => ({ data: [], isLoading: false }),
  useAddMediaCover: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateMediaCover: () => ({ mutate: vi.fn(), isPending: false }),
  useSetMediaCoverStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useTouchMediaCover: () => ({ mutate: vi.fn(), isPending: false }),
  useAddDesignPhotos: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadCover: () => ({ mutate: vi.fn(), isPending: false }),
  // الحذف الناجح كما في الواقع: الخادم أزال التصميم، فأي طلب تفاصيل بعده يعود NOT_FOUND، ثم يُستدعى onSuccess
  useDeleteDesign: () => ({
    mutate: (args: unknown[], opts?: { onSuccess?: () => void }) => {
      h.del(args)
      h.detail = gone()
      opts?.onSuccess?.()
    },
    isPending: false,
  }),
  useSaveDesignReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderDesignPhotos: () => ({ mutate: vi.fn(), isPending: false }),
  useSignedPhotoUrls: () => ({ data: {} }),
  useSubmissions: () => ({ data: [] }),
  useSubmissionPhotos: () => ({ data: [], isLoading: false }),
}))
vi.mock('@stores/ui.store', () => ({
  useUiStore: (sel: (s: { addToast: typeof h.toast }) => unknown) => sel({ addToast: h.toast }),
}))

import MediaDesignsPage from '@portals/media/pages/Designs/MediaDesignsPage'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const gone = () => ({
  isLoading: false, isFetching: false, isError: true, data: undefined, refetch: h.refetch,
  error: new Error('P0001: MEDIA_DESIGN_NOT_FOUND'),
})
const offline = () => ({
  isLoading: false, isFetching: false, isError: true, data: undefined, refetch: h.refetch,
  error: Object.assign(new Error('تعذر الاتصال بالخادم — تحقق من الشبكة'), { code: 'NETWORK' }),
})
const photo = { photo_id: 'r1', source_photo_id: 's1', source_submission_id: 'x', work_type: 'كنس', storage_path: 'p1', caption: 'أ', report_caption: null, display_fit: 'contain', display_zoom: 1, sort_order: 1 }
const loaded = (photos: unknown[], photoCount: number) => ({
  isLoading: false, isFetching: false, isError: false, refetch: h.refetch,
  data: {
    design: { id: 'd1', title: 'تقرير اليوم', period_type: 'daily', sector_parent: 'karrada', status: 'draft', photo_count: photoCount, cover_image_path: null, period_start: '2026-11-16', period_end: '2026-11-16', summary: null, template_colors: null },
    sheets: [],
    photos,
  },
})

function Probe() {
  const l = useLocation()
  return <output data-testid="loc">{l.search}</output>
}

/** موجّه بيانات كما في التطبيق: مسار البوابة له loader متأخر يُعاد تشغيله عند تغيّر ?search، والصفحة ابنه */
function mount(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/media',
        loader: async () => { h.loader(); await sleep(5); return null },
        element: <Outlet />,
        children: [{ path: 'designs', element: <><MediaDesignsPage /><Probe /></> }],
      },
    ],
    { initialEntries: [url], hydrationData: { loaderData: { '0': null } } },
  )
  render(<RouterProvider router={router} />)
  return router
}
const search = () => screen.getByTestId('loc').textContent
const warnings = () => h.toast.mock.calls.filter(([t]) => (t as { type: string }).type === 'warning')
/** هدوء: لا حلقة رسم ولا حلقة تنقّل (الحلقة الأصلية تُنتج آلاف الرسوم واستدعاءات loader في الثانية) */
const calm = (maxLoads = 3) => {
  expect(h.renders).toBeLessThan(80)
  expect(h.loader.mock.calls.length).toBeLessThanOrEqual(maxLoads)
}

beforeEach(() => {
  h.toast.mockReset(); h.loader.mockReset(); h.refetch.mockReset(); h.del.mockReset()
  h.renders = 0
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('رابط ?open= لتصميم محذوف — بلا حلقة', () => {
  it('إشعار واحد فقط، يُنظَّف الرابط، ولا تُعاد الرسوم ولا loader بلا توقف', async () => {
    h.detail = gone()
    mount('/media/designs?open=deleted-id')
    await waitFor(() => expect(search()).toBe(''), { timeout: 3000 })
    await act(async () => { await sleep(400) })      // لو كانت حلقة لتراكمت عشرات الإشعارات والرسوم هنا
    expect(warnings()).toHaveLength(1)
    expect(warnings()[0]![0]).toMatchObject({ message: expect.stringContaining('غير موجود') })
    expect(screen.queryByText('جارٍ فتح التصميم…')).toBeNull()
    calm()
  })

  it('فتح رابطين محذوفين متتاليين ينبّه لكل منهما مرة واحدة', async () => {
    h.detail = gone()
    const router = mount('/media/designs?open=a')
    await waitFor(() => expect(search()).toBe(''), { timeout: 3000 })
    await act(async () => { await router.navigate('/media/designs?open=b') })
    await waitFor(() => expect(search()).toBe(''), { timeout: 3000 })
    await act(async () => { await sleep(300) })
    expect(warnings()).toHaveLength(2)
    calm()
  })
})

describe('فشل تحميل التصميم لغير سبب الحذف (شبكة/خادم) — رسالة صحيحة وإعادة محاولة', () => {
  it('لا يقول «غير موجود»، لا إشعارات، الرابط يبقى، وتظهر «إعادة المحاولة» التي تستدعي refetch', async () => {
    h.detail = offline()
    mount('/media/designs?open=d1')
    await screen.findByTestId('design-load-failed')
    await act(async () => { await sleep(400) })
    expect(h.toast).not.toHaveBeenCalled()
    expect(search()).toBe('?open=d1')
    expect(screen.getByText(/تعذّر الاتصال بالخادم/)).toBeInTheDocument()
    expect(screen.queryByText(/غير موجود/)).toBeNull()
    calm(0)

    fireEvent.click(screen.getByTestId('design-load-retry'))
    expect(h.refetch).toHaveBeenCalledTimes(1)
  })

  it('أثناء الجلب يُعطَّل زر الإعادة، و«إغلاق» ينظّف الرابط بلا إشعار', async () => {
    h.detail = { ...offline(), isFetching: true }
    mount('/media/designs?open=d1')
    expect(await screen.findByTestId('design-load-retry')).toBeDisabled()
    fireEvent.click(screen.getByTestId('design-load-close'))
    await waitFor(() => expect(search()).toBe(''), { timeout: 3000 })
    expect(h.toast).not.toHaveBeenCalled()
    calm()
  })

  it('فشل إعادة تحميل في الخلفية وعند المحرر بيانات سابقة: يبقى المحرر مفتوحاً ولا يُغلق', async () => {
    h.detail = { ...loaded([], 0), isError: true, error: offline().error }
    mount('/media/designs?open=d1')
    await screen.findByTestId('composer-fullscreen')
    await act(async () => { await sleep(200) })
    expect(screen.queryByTestId('design-load-failed')).toBeNull()
    expect(h.toast).not.toHaveBeenCalled()
    expect(search()).toBe('?open=d1')
    calm(0)
  })
})

describe('تصميم بلا صور — يبقى المحرر مفتوحاً فارغاً (قرار المستخدم)', () => {
  it('رسالة «لا توجد صور»، «حذف كل الصور» مخفي، «إكمال» معطّل، «حذف المسودة» و«إضافة صور» ظاهران، بلا إشعارات ولا إغلاق', async () => {
    h.detail = loaded([], 0)
    mount('/media/designs?open=d1')
    await screen.findByTestId('composer-fullscreen')
    await act(async () => { await sleep(300) })
    expect(screen.getByText('لا توجد صور في هذا التصميم بعد.')).toBeInTheDocument()
    expect(screen.queryByTestId('remove-all-photos')).toBeNull()
    expect(screen.getByText('إكمال التصميم وقفله')).toBeDisabled()
    expect(screen.getByText('حذف المسودة')).toBeEnabled()
    expect(screen.getByText('إضافة صور من تذكرات')).toBeInTheDocument()
    expect(h.toast).not.toHaveBeenCalled()
    expect(search()).toBe('?open=d1')
    calm(0)
  })
})

describe('«حذف المسودة» — يُغلق بلا حلقة وبلا تنبيه «غير موجود» كاذب', () => {
  it('بعد نجاح الحذف يعود NOT_FOUND للتفاصيل: لا إشعار أصفر، الرابط يُنظَّف، ولا حلقة', async () => {
    h.detail = loaded([photo], 1)
    mount('/media/designs?open=d1')
    await screen.findByTestId('composer-fullscreen')
    fireEvent.click(screen.getByText('حذف المسودة'))
    await waitFor(() => expect(search()).toBe(''), { timeout: 3000 })
    await act(async () => { await sleep(400) })
    expect(h.del).toHaveBeenCalledTimes(1)
    expect(warnings()).toHaveLength(0)
    calm()
  })
})
