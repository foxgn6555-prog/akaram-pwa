import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InboxPage from '../../../src/portals/complaints/pages/Inbox/InboxPage'
import AssignmentPage from '../../../src/portals/complaints/pages/Assignment/AssignmentPage'
import AssignedComplaintsPage from '../../../src/portals/manager/pages/Complaints/AssignedComplaintsPage'
import ComplaintDetailPage from '../../../src/portals/complaints/pages/Processing/ComplaintDetailPage'

const h=vi.hoisted(()=>({batchSort:vi.fn(),batchAssign:vi.fn(),updateReview:vi.fn(),replaceMedia:vi.fn()}))
vi.mock('@features/complaints',()=>({
 useComplaintSettings:()=>({data:[{key:'complaints.issue_types',value:['مخلفات زراعية','تراكم نفايات','أنقاض']}]}),
 useComplaintInbox:()=>({data:[{id:'m1',senderEmail:'sender@test.iq',senderName:'بلدية الكرادة',replyTo:null,subject:'60 موقع',bodyText:'المحلة والزقاق في الصور',sector:'karrada',receivedAt:'2026-09-05T08:00:00Z',status:'ready',attachmentCount:2,duplicateOf:null}],isLoading:false,error:null,refetch:vi.fn(),isFetching:false}),
 useArchiveComplaintEmail:()=>({mutate:vi.fn(),isPending:false}),
 useComplaintInboxMediaPage:(id:string|null)=>({isLoading:false,data:id?{rows:[{id:'f1',mediaCode:'IMG-A',name:'a.jpg',mimeType:'image/jpeg',url:'https://test/a.jpg',duplicate:false,duplicateCount:0,itemId:null},{id:'f2',mediaCode:'IMG-B',name:'b.jpg',mimeType:'image/jpeg',url:'https://test/b.jpg',duplicate:true,duplicateCount:1,itemId:null}],totalCount:2,imageCount:2,sortedImageCount:0,remainingImageCount:2}:{rows:[],totalCount:0,imageCount:0,sortedImageCount:0,remainingImageCount:0}}),
 useBatchCreateComplaintItems:()=>({mutate:h.batchSort,isPending:false}),
 useExtractComplaintPdf:()=>({mutate:vi.fn(),isPending:false}),useComplaintOcr:()=>({mutate:vi.fn(),isPending:false}),
 useComplaintItems:(manager?:boolean)=>({isLoading:false,data:[
  {id:'i1',complaintId:'c1',referenceNo:'CMP-1',complaintStatus:'under_review',sector:'karrada',sequenceNo:1,title:null,municipalCenter:null,neighborhood:'901',alley:'1',locationText:null,ocrText:null,assignedTo:manager?'mgr1':null,status:manager?'assigned':'under_review',managerNotes:null,reviewerNotes:null,receivedAt:'2026-09-05'},
  {id:'i2',complaintId:'c1',referenceNo:'CMP-1',complaintStatus:'under_review',sector:'karrada',sequenceNo:2,title:null,municipalCenter:null,neighborhood:'902',alley:'2',locationText:null,ocrText:null,assignedTo:manager?'mgr1':null,status:manager?'assigned':'under_review',managerNotes:null,reviewerNotes:null,receivedAt:'2026-09-05'},
 ]}),
 useComplaintManagers:()=>({data:[{userId:'mgr1',fullName:'مسؤول أول',jobTitle:null}]}),
 useAssignComplaintItems:()=>({mutate:h.batchAssign,isPending:false}),
 useComplaintItemsMedia:(ids:string[])=>({data:ids.length?[{id:'f1',itemId:'i1',mediaCode:'IMG-A',kind:'before',url:'https://test/a.jpg',name:'a.jpg',mimeType:'image/jpeg',capturedAt:null,isActive:true,replacementReason:null,supersededAt:null}]:[]}),
 useComplaintItemMedia:()=>({data:[]}),useStartComplaintItem:()=>({mutate:vi.fn()}),useCompleteComplaintItem:()=>({mutate:vi.fn(),isPending:false}),compareImageContext:vi.fn(),
 useComplaintItemDetail:()=>({isLoading:false,data:{item:{id:'i1',complaintId:'c1',referenceNo:'CMP-1',complaintStatus:'quality_review',sector:'karrada',sequenceNo:1,title:'نفايات',municipalCenter:'الكرادة',neighborhood:'901',alley:'1',locationText:null,ocrText:null,assignedTo:'mgr1',status:'processed',managerNotes:null,reviewerNotes:null,receivedAt:'2026-09-05'},media:[{id:'active-before',itemId:'i1',mediaCode:'IMG-A',kind:'before',url:'https://test/a.jpg',name:'a.jpg',mimeType:'image/jpeg',capturedAt:null,isActive:true,replacementReason:null,supersededAt:null},{id:'old-before',itemId:'i1',mediaCode:'IMG-OLD',kind:'before',url:'https://test/old.jpg',name:'old.jpg',mimeType:'image/jpeg',capturedAt:null,isActive:false,replacementReason:'صورة أوضح',supersededAt:'2026-09-05'}],history:[{id:'h1',fromStatus:'under_review',toStatus:'assigned',note:null,actorId:'u1',createdAt:'2026-09-05T09:00:00Z'}],senderEmail:'sender@test.iq',subject:'بلاغ',bodyText:'تفاصيل البلاغ\n[image: PHOTO-1.jpg]\n[image: PHOTO-2.jpg]',inboxMessageId:'m1'}}),
 useComplaintDeliveries:()=>({data:[]}),useReviewComplaintItem:()=>({mutate:vi.fn()}),useUpdateComplaintItemDuringReview:()=>({mutate:h.updateReview,isPending:false}),useReplaceComplaintItemMedia:()=>({mutate:h.replaceMedia,isPending:false}),
}))
function view(node:ReactNode){return render(<MemoryRouter>{node}</MemoryRouter>)}

describe('أتمتة فرز وإسناد الشكاوى على دفعات',()=>{
 beforeEach(()=>{h.batchSort.mockReset();h.batchAssign.mockReset();h.updateReview.mockReset();h.replaceMedia.mockReset()})
 it('يعرض البريد دون فرض عرض أفقي ويبعد الإجراء الثابت عن شريط الموبايل',()=>{view(<InboxPage sector="karrada"/>);const row=screen.getByRole('button',{name:/بلدية الكرادة.*60 موقع/});expect(row).toHaveClass('min-w-0');expect(row.className).not.toContain('min-w-[680px]');fireEvent.click(row);expect(screen.getByRole('button',{name:'اعتماد بيانات الصور وتجهيزها للإسناد'}).closest('.sticky')).toHaveClass('bottom-[calc(5rem+env(safe-area-inset-bottom))]')})
 it('يعرض تفاصيل البريد وكوداً دائماً وتحذير التكرار لكل صورة',()=>{
  view(<InboxPage sector="karrada"/>);fireEvent.click(screen.getByText('60 موقع'))
  expect(screen.getByText('المحلة والزقاق في الصور')).toBeInTheDocument()
  expect(screen.getByText('IMG-A')).toBeInTheDocument();expect(screen.getByText('IMG-B')).toBeInTheDocument()
  expect(screen.getByText(/البصمة موجودة في 1 ملف/)).toBeInTheDocument()
 })
 it('يضع تراكم نفايات افتراضياً ويطبق نوعاً موحداً على كل الصور',()=>{view(<InboxPage sector="karrada"/>);fireEvent.click(screen.getByText('60 موقع'));const types=screen.getAllByLabelText('نوع التلكؤ (مطلوب)') as HTMLInputElement[];expect(types.every(input=>input.value==='تراكم نفايات')).toBe(true);fireEvent.change(screen.getByLabelText('نوع تلكؤ موحد لكل الصور'),{target:{value:'أنقاض'}});fireEvent.click(screen.getByRole('button',{name:'تطبيق على صور الصفحة (2)'}));expect((screen.getAllByLabelText('نوع التلكؤ (مطلوب)') as HTMLInputElement[]).every(input=>input.value==='أنقاض')).toBe(true);expect(screen.getByText(/تم تطبيق نوع التلكؤ/)).toBeInTheDocument()})
 it('ينشئ تذكرة مستقلة لكل صورة ولا يسمح بالدفعة قبل موقع كل صورة',()=>{
  view(<InboxPage sector="karrada"/>);fireEvent.click(screen.getByText('60 موقع'));fireEvent.click(screen.getByText('تحديد صور الصفحة (2)'))
  const submit=screen.getByRole('button',{name:'اعتماد بيانات الصور وتجهيزها للإسناد'});expect(submit).toBeDisabled()
  const neighborhoods=screen.getAllByLabelText('المحلة (م)');const alleys=screen.getAllByLabelText('الزقاق (ز)');const types=screen.getAllByLabelText('نوع التلكؤ (مطلوب)')
  fireEvent.change(neighborhoods[0]!,{target:{value:'901'}});fireEvent.change(alleys[0]!,{target:{value:'1'}});fireEvent.change(types[0]!,{target:{value:'تراكم نفايات'}})
  fireEvent.change(neighborhoods[1]!,{target:{value:'902'}});fireEvent.change(alleys[1]!,{target:{value:'2'}});fireEvent.change(types[1]!,{target:{value:'أنقاض'}})
  expect(submit).toBeEnabled();fireEvent.click(submit)
  expect(h.batchSort).toHaveBeenCalledWith(expect.objectContaining({messageId:'m1',entries:[expect.objectContaining({mediaId:'f1',neighborhood:'901',alley:'1'}),expect.objectContaining({mediaId:'f2',neighborhood:'902',alley:'2'})]}),expect.any(Object))
 })
 it('يعرض الإسناد بهرم مجلد البريد ثم المواقع داخله',()=>{
  view(<AssignmentPage/>);expect(screen.getByText('1 مجلد · 2 تذكرة')).toBeInTheDocument();fireEvent.click(screen.getByLabelText('فتح مجلد CMP-1'));expect(screen.getByText('الموقع 1')).toBeInTheDocument();expect(screen.getByText('الموقع 2')).toBeInTheDocument();fireEvent.click(screen.getByLabelText('تحديد مجلد CMP-1'));expect(screen.getByRole('button',{name:'إسناد 2 تذكرة'})).toBeDisabled()
 })
 it('يسند عدة تذاكر لمسؤول واحد باستدعاء ذري واحد',()=>{
  view(<AssignmentPage/>);fireEvent.click(screen.getByText('تحديد كل المنتظر'));fireEvent.change(screen.getByLabelText('مسؤول القسم للدفعة'),{target:{value:'mgr1'}});fireEvent.click(screen.getByRole('button',{name:'إسناد 2 تذكرة'}))
  expect(h.batchAssign).toHaveBeenCalledWith({itemIds:['i1','i2'],managerId:'mgr1'},expect.any(Object))
 })
 it('يمكّن مسؤول القسم من تحديد عدة تذاكر وتنزيل صور قبل في ZIP واحد',()=>{
  view(<AssignedComplaintsPage/>);fireEvent.click(screen.getByText('تحديد التذاكر الظاهرة'))
  expect(screen.getByRole('button',{name:'تنزيل صور 1 تذكرة'})).toBeEnabled()
  expect(screen.getByRole('link',{name:'دليل العمل'})).toHaveAttribute('href','/manager/complaints-guidance')
 })
 it('تعرض صفحة التدقيق النسخة الحالية والسابقة دون خطأ JavaScript',()=>{
  const consoleError=vi.spyOn(console,'error').mockImplementation(()=>undefined)
  view(<ComplaintDetailPage/>);expect(screen.getByText('النسخ السابقة')).toBeInTheDocument();expect(screen.getByText('IMG-A')).toBeInTheDocument()
  expect(screen.getByText('بانتظار الإسناد ← مسندة إلى المسؤول')).toBeInTheDocument()
  expect(screen.getByText('تفاصيل البلاغ')).toBeInTheDocument();expect(screen.queryByText(/PHOTO-1/)).toBeNull();expect(screen.getByRole('alert')).toHaveTextContent('لا يمكن الاعتماد قبل وجود صورة معالجة فعالة');expect(screen.getByRole('button',{name:'اعتماد الموقع'})).toBeDisabled()
  expect(consoleError).not.toHaveBeenCalled();consoleError.mockRestore()
 })
 it('يسجل تصحيح الموقع واستبدال الصورة من صفحة التدقيق',()=>{
  view(<ComplaintDetailPage/>);fireEvent.change(screen.getByLabelText('المحلة'),{target:{value:'905'}});fireEvent.change(screen.getByLabelText('الزقاق'),{target:{value:'8'}});fireEvent.change(screen.getByLabelText('سبب التصحيح'),{target:{value:'تصحيح الكتاب'}});fireEvent.click(screen.getByRole('button',{name:'حفظ التصحيح'}))
  expect(h.updateReview).toHaveBeenCalledWith(expect.objectContaining({itemId:'i1',fields:expect.objectContaining({neighborhood:'905',alley:'8'}),reason:'تصحيح الكتاب'}),expect.any(Object))
  fireEvent.change(screen.getByLabelText(/سبب استبدال الصورة/),{target:{value:'الصورة أوضح'}});const file=new File(['image'],'new.jpg',{type:'image/jpeg'});fireEvent.change(screen.getByLabelText('اختيار صورة بديلة'),{target:{files:[file]}})
  expect(h.replaceMedia).toHaveBeenCalledWith({itemId:'i1',oldMediaId:'active-before',kind:'before',file,reason:'الصورة أوضح'},expect.any(Object))
 })
})
