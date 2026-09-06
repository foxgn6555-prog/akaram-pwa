import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from '../../../src/portals/complaints/pages/Dashboard/DashboardPage'
import ProcessingPage from '../../../src/portals/complaints/pages/Processing/ProcessingPage'
import TemplatesPage from '../../../src/portals/complaints/pages/Templates/TemplatesPage'
import DataPage from '../../../src/portals/complaints/pages/Data/DataPage'
import SettingsPage from '../../../src/portals/complaints/pages/Settings/SettingsPage'
import ArchivePage from '../../../src/portals/complaints/pages/Archive/ArchivePage'
import SupportPage from '../../../src/portals/complaints/pages/Support/SupportPage'

const mutate = vi.fn()
const item = { id:'i1',complaintId:'c1',sequenceNo:1,referenceNo:'CMP-1',complaintStatus:'archived',sector:'karrada',
  title:'نفايات',ticketName:'موضوع البريد',municipalCenter:'المركز',neighborhood:'901',alley:'2',locationText:null,assignedTo:'mgr1',status:'processed',
  managerNotes:null,reviewerNotes:null,receivedAt:'2026-09-03T08:00:00Z' }
vi.mock('@features/complaints',()=>({
  useComplaintSummary:()=>({data:{total:4,newCount:1,assigned:1,inProgress:0,processed:2,archived:1},isLoading:false}),
  useComplaintAnalytics:()=>({data:{from:'2026-09-01',to:'2026-09-05',sector:null,summary:{total:4,approved:2,active:1,review:1,unassigned:0,withAfter:2},daily:[{day:'2026-09-05',total:4,approved:2,active:1,review:1}],statuses:[],sectors:[]},isLoading:false}),
  printComplaintAnalytics:vi.fn(),downloadComplaintAnalytics:vi.fn(),
  useComplaintItems:()=>({data:[item],isLoading:false}),useComplaintItemMedia:()=>({data:[]}),useComplaintItemsMedia:()=>({data:[]}),useComplaintManagers:()=>({data:[{userId:'mgr1',fullName:'مسؤول أول'}]}),
  useReviewComplaintItem:()=>({mutate,isPending:false}),useReviewComplaintAssignmentTicket:()=>({mutate,isPending:false}), useComplaintTemplates:()=>({data:[]}),
  useComplaintReports:()=>({data:[]}),useComplaintArchiveFolders:()=>({data:[{id:'f1',inboxMessageId:'m1',subject:'CMP-1',senderEmail:'sender@example.com',sector:'karrada',archivedAt:'2026-01-01',snapshot:{attachmentCount:2}}],isLoading:false}),useComplaintDeletionRequests:()=>({data:[]}),useRestoreComplaintEmail:()=>({mutate}),useRequestComplaintDeletion:()=>({mutate}),useComplaintInbox:()=>({data:[]}),useSaveComplaintTemplate:()=>({mutate}),usePrepareComplaintReport:()=>({mutate}),usePrepareComplaintEmailReport:()=>({mutate}),
  useGenerateComplaintReport:()=>({mutate}),useSetComplaintReportStatus:()=>({mutate}),useSendComplaintEmail:()=>({mutate}),
  useComplaintReportDownload:()=>({mutate}),useComplaintContacts:()=>({data:[]}),useComplaintSettings:()=>({data:[]}),
  useSaveComplaintContact:()=>({mutate}),useSaveComplaintSetting:()=>({mutate}),
}))

function view(node:ReactNode){return render(<MemoryRouter>{node}</MemoryRouter>)}
describe('صفحات بوابة الشكاوى المكتملة',()=>{
  beforeEach(()=>mutate.mockClear())
  it('تعرض لوحة التحكم والروابط التشغيلية',()=>{view(<DashboardPage/>);expect(screen.getByText('نظرة واضحة، قرار أسرع، مدينة أجمل')).toBeInTheDocument();expect(screen.getByText('الفرز والإسناد')).toBeInTheDocument()})
  it('تعرض قائمة التدقيق قبل/بعد',()=>{view(<ProcessingPage/>);expect(screen.getByText('معالجة الشكاوى والتدقيق')).toBeInTheDocument();expect(screen.getByText(/CMP-1/)).toBeInTheDocument()})
  it('تعرض محرر القوالب وإنشاء التقرير',()=>{view(<TemplatesPage/>);expect(screen.getByText('صمّم، راجع، ثم أرسل بثقة')).toBeInTheDocument();expect(screen.getByText('إعداد تقرير يومي')).toBeInTheDocument()})
  it('تعرض قاعدة البيانات والصف المؤرشف',()=>{view(<DataPage/>);expect(screen.getByText('بيانات الشكاوى')).toBeInTheDocument();expect(screen.getByText('CMP-1/1')).toBeInTheDocument()})
  it('تعرض إعدادات التواصل دون أسرار Mailgun',()=>{view(<SettingsPage/>);expect(screen.getByText('إعدادات الصفحات والتواصل')).toBeInTheDocument();expect(screen.getByText(/مفاتيح Mailgun تبقى/)).toBeInTheDocument()})
  it('تعرض الأرشيف غير القابل للحذف',()=>{view(<ArchivePage/>);expect(screen.getByText('أرشيف الشكاوى')).toBeInTheDocument();expect(screen.getByText(/CMP-1/)).toBeInTheDocument()})
  it('تعرض حالة الدعم الفني المقصودة',()=>{view(<SupportPage/>);expect(screen.getByText('الدعم الفني')).toBeInTheDocument()})
})
