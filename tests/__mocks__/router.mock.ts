/** Mock لـ react-router — لاختبارات مكونات تعتمد التوجيه */
import { vi } from 'vitest'

export const mockNavigate = vi.fn()

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Navigate: () => null,
  }
})
