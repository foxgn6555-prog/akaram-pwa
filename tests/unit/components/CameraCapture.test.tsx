/**
 * نافذة التقاط الصور بالكاميرا (getUserMedia):
 *  · تطلب الكاميرا بلا صوت وتشغّل البث عند الجاهزية
 *  · زر الالتقاط يحوّل الإطار إلى File (jpeg) ويستدعي onCapture ثم يغلق ويوقف المسار
 *  · رفض الإذن يظهر برسالة عربية واضحة
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CameraCapture } from '@components/ui/Camera/CameraCapture'

const fakeTrack = { stop: vi.fn() }
const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream
const gUM = vi.fn()

function stubMediaDevices(): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: gUM },
  })
}

beforeEach(() => {
  stubMediaDevices()
  gUM.mockReset().mockResolvedValue(fakeStream)
  // jsdom لا يدعم تشغيل الوسائط
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CameraCapture', () => {
  it('يطلب الكاميرا (بلا صوت) ويعرض البث عند الجاهزية', async () => {
    render(<CameraCapture open onClose={vi.fn()} onCapture={vi.fn()} />)
    await waitFor(() => {
      expect(gUM).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    })
    await waitFor(() => {
      expect(screen.getByTestId('camera-video')).not.toHaveClass('hidden')
    })
  })

  it('زر الالتقاط يُنشئ ملف jpeg ويستدعي onCapture ثم يغلق ويوقف المسار', async () => {
    const user = userEvent.setup()
    const onCapture = vi.fn()
    const onClose = vi.fn()
    const { unmount } = render(<CameraCapture open onClose={onClose} onCapture={onCapture} />)
    await waitFor(() => expect(screen.getByTestId('camera-shot')).toBeEnabled())

    // jsdom لا يدعم canvas (getContext يُعيد null و toBlob غير موجود) — نحاكيهما
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (cb: BlobCallback | null) => { cb?.(blob) },
    )

    await user.click(screen.getByTestId('camera-shot'))
    expect(onCapture).toHaveBeenCalledTimes(1)
    const file = onCapture.mock.calls[0]?.[0] as File
    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe('image/jpeg')
    expect(file.name).toContain('كاميرا-')
    expect(onClose).toHaveBeenCalledTimes(1)
    // إغلاق النافذة (open=false) أو فك التركيب يوقف مسار الكاميرا
    unmount()
    expect(fakeTrack.stop).toHaveBeenCalled()
  })

  it('زر تبديل الكاميرا يعيد الطلب بالوضع الأمامي', async () => {
    const user = userEvent.setup()
    render(<CameraCapture open onClose={vi.fn()} onCapture={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('camera-flip')).toBeInTheDocument())
    gUM.mockClear()
    await user.click(screen.getByTestId('camera-flip'))
    await waitFor(() => {
      expect(gUM).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'user' } }, audio: false })
    })
  })

  it('رفض إذن الكاميرا يظهر برسالة عربية', async () => {
    gUM.mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    render(<CameraCapture open onClose={vi.fn()} onCapture={vi.fn()} />)
    expect(await screen.findByTestId('camera-error')).toHaveTextContent('رُفض إذن الكاميرا')
    // زر الالتقاط معطّل عند الخطأ
    expect(screen.getByTestId('camera-shot')).toBeDisabled()
  })

  it('غياب دعم المتصفح يعرض بديل اختيار الملف', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    render(<CameraCapture open onClose={vi.fn()} onCapture={vi.fn()} />)
    expect(await screen.findByTestId('camera-error')).toHaveTextContent('المتصفح لا يدعم الكاميرا')
  })
})