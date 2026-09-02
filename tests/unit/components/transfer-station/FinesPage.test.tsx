/** صفحة الغرامات — حالة قيد الإنشاء */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import FinesPage from '@portals/transfer-station/pages/Fines/FinesPage'

describe('FinesPage', () => {
  it('يعرض العنوان وحالة قيد الإنشاء', () => {
    render(
      <MemoryRouter>
        <FinesPage />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('fines-page')).toBeInTheDocument()
    expect(screen.getByText('الغرامات')).toBeInTheDocument()
    expect(screen.getByText('هذه الوحدة قيد الإنشاء')).toBeInTheDocument()
  })
})