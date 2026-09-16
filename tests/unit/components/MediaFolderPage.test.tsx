/** فولدر القاطع: شريط توزيع التذاكر حسب نوع العمل + العدادات */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { baghdadDay } from '@features/media/constants'

const today = baghdadDay()

vi.mock('@features/media/hooks', () => ({
  useSubmissions: () => ({
    isLoading: false,
    data: [
      { id: 'a1', title: 'كنس 1', mode: 'street', work_type: 'كنس الشوارع', photo_count: 2, event_date: `${today}T08:00:00`, created_at: `${today}T08:00:00`, status: 'active' },
      { id: 'a2', title: 'كنس 2', mode: 'street', work_type: 'كنس الشوارع', photo_count: 1, event_date: `${today}T09:00:00`, created_at: `${today}T09:00:00`, status: 'active' },
      { id: 'a3', title: 'حاويات', mode: 'campaign', work_type: 'رفع حاويات', photo_count: 3, event_date: `${today}T10:00:00`, created_at: `${today}T10:00:00`, status: 'active' },
    ],
  }),
  useSubmissionPhotos: () => ({ isLoading: false, data: [] }),
}))

import MediaFolderPage from '@portals/media/pages/Folders/MediaFolderPage'

describe('فولدر القاطع', () => {
  it('يعرض توزيع الأنواع بأشرطة نسبية وعدّ كل نوع', () => {
    render(<MediaFolderPage sector="karrada" />)
    const dist = screen.getByTestId('work-dist')
    expect(dist.textContent).toContain('كنس الشوارع')
    expect(dist.textContent).toContain('رفع حاويات')
    // كنس الشوارع تذكرة عددها 2 وهو الأعلى (100%)
    const rows = [...dist.querySelectorAll(':scope > div')]
    expect(rows.length).toBe(2)
    expect(rows[0]?.textContent).toContain('2')
    expect(rows[1]?.textContent).toContain('1')
  })

  it('عدّادات التذاكر والصور واليوم', () => {
    render(<MediaFolderPage sector="karrada" />)
    expect(screen.getByText('3 تذكرة')).toBeInTheDocument()
    expect(screen.getByText('6 صورة')).toBeInTheDocument()
    expect(screen.getByText('3 تذكرة اليوم')).toBeInTheDocument()
  })
})
