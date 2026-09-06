import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import AssignmentPage from '../../../src/portals/complaints/pages/Assignment/AssignmentPage'

const items = Array.from({ length: 60 }, (_, index) => ({
  id: `item-${index + 1}`, complaintId: 'complaint-large', referenceNo: 'CMP-60', complaintStatus: 'under_review',
  sector: 'karrada', sequenceNo: index + 1, title: 'تراكم نفايات', municipalCenter: 'بلدية الكرادة',
  neighborhood: String(900 + index), alley: String(index + 1), locationText: null, ocrText: null,
  assignedTo: null, status: 'under_review', managerNotes: null, reviewerNotes: null,
  receivedAt: '2026-09-06T08:00:00Z', inboxMessageId: 'mail-large', ticketName: 'بريد ميداني كبير — 60 موقعاً',
}))
vi.mock('@features/complaints', () => ({
  useComplaintItems: () => ({ data: items, isLoading: false }),
  useComplaintManagers: () => ({ data: [{ userId: 'manager-1', fullName: 'مسؤول القسم', jobTitle: null }] }),
  useAssignComplaintItems: () => ({ mutate: vi.fn(), isPending: false }),
}))

describe('تجربة البريد الكبير في الإسناد', () => {
  it('يعرض 60 موقعاً داخل مجلد واحد ولا يملأ الشاشة قبل فتحه', () => {
    render(<MemoryRouter><AssignmentPage /></MemoryRouter>)
    expect(screen.getByText('1 مجلد · 60 تذكرة')).toBeInTheDocument()
    expect(screen.queryByText('الموقع 60')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('فتح مجلد CMP-60'))
    expect(screen.getByText('الموقع 1')).toBeInTheDocument()
    expect(screen.getByText('الموقع 60')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('تحديد مجلد CMP-60'))
    expect(screen.getByRole('button', { name: 'إسناد 60 تذكرة' })).toBeDisabled()
  })
})
