import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CameraCapture } from '@features/contractors/components/CameraCapture'

const track = { stop: vi.fn() }
const stream = { getTracks: () => [track] } as unknown as MediaStream
function mockCamera(impl: (c: MediaStreamConstraints) => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(impl) } })
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: () => Promise.resolve() })
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn() })) as never
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(['x'], { type: 'image/jpeg' })) }
}
afterEach(() => { track.stop.mockClear() })

describe('CameraCapture — التقاط مباشر بالكاميرا', () => {
  it('السلفي يطلب الكاميرا الأمامية، والالتقاط يُنتج ملف JPEG ويغلق الكاميرا', async () => {
    mockCamera(() => Promise.resolve(stream))
    const onCapture = vi.fn(), onClose = vi.fn()
    render(<CameraCapture facing="user" title="صورتك" testId="selfie" onCapture={onCapture} onClose={onClose} />)
    const gum = navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>
    await waitFor(() => expect(gum).toHaveBeenCalled())
    expect(JSON.stringify(gum.mock.calls[0]?.[0])).toContain('"facingMode":{"exact":"user"}')
    await waitFor(() => expect(screen.getByTestId('selfie-snap')).toBeEnabled())
    await act(async () => { fireEvent.click(screen.getByTestId('selfie-snap')) })
    expect(onCapture).toHaveBeenCalledWith(expect.any(File))
    expect((onCapture.mock.calls[0]?.[0] as File).type).toBe('image/jpeg')
    expect(track.stop).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
  it('صورة العمال تطلب الكاميرا الخلفية', async () => {
    mockCamera(() => Promise.resolve(stream))
    render(<CameraCapture facing="environment" title="العمال" testId="team" onCapture={vi.fn()} onClose={vi.fn()} />)
    const gum = navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>
    await waitFor(() => expect(gum).toHaveBeenCalled())
    expect(JSON.stringify(gum.mock.calls[0]?.[0])).toContain('"facingMode":{"exact":"environment"}')
  })
  it('عند رفض الإذن: رسالة سبب + زر إعادة محاولة فقط — لا يوجد أي اختيار من الألبوم', async () => {
    mockCamera(() => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })))
    const { container } = render(<CameraCapture facing="environment" title="العمال" testId="team" onCapture={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('رفضت إذن الكاميرا'))
    expect(container.querySelector('input[type="file"]')).toBeNull()
    const gum = navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>
    const before = gum.mock.calls.length
    fireEvent.click(screen.getByTestId('team-retry'))
    await waitFor(() => expect(gum.mock.calls.length).toBeGreaterThan(before))
  })
  it('لا كاميرا في الجهاز → رسالة مناسبة', async () => {
    mockCamera(() => Promise.reject(Object.assign(new Error(), { name: 'NotFoundError' })))
    render(<CameraCapture facing="user" title="صورتك" testId="selfie" onCapture={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('لم يُعثر على كاميرا'))
  })
  it('exact غير مدعوم → يعيد المحاولة بقيد أخف', async () => {
    let n = 0
    mockCamera((c) => { n++; return JSON.stringify(c).includes('exact') ? Promise.reject(Object.assign(new Error(), { name: 'OverconstrainedError' })) : Promise.resolve(stream) })
    render(<CameraCapture facing="user" title="صورتك" testId="selfie" onCapture={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('selfie-snap')).toBeEnabled())
    expect(n).toBe(2)
  })
})
