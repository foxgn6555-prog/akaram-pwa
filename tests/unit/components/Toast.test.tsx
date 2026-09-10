import{act,fireEvent,render,screen}from'@testing-library/react'
import{beforeEach,describe,expect,it,vi}from'vitest'
import{Toaster}from'@components/ui/Toast/Toast'
import{useUiStore}from'@stores/ui.store'
describe('رسائل نجاح وفشل الإجراءات',()=>{beforeEach(()=>{vi.useFakeTimers();useUiStore.setState({toasts:[]})});it('تختفي رسالة النجاح تلقائياً',()=>{useUiStore.getState().addToast({type:'success',message:'تم الحفظ'});render(<Toaster/>);expect(screen.getByText('تم الحفظ')).toBeInTheDocument();act(()=>vi.advanceTimersByTime(3500));expect(screen.queryByText('تم الحفظ')).not.toBeInTheDocument()});it('يمكن إغلاق رسالة الخطأ فوراً بالنقر',()=>{useUiStore.getState().addToast({type:'error',message:'تعذر الحفظ'});render(<Toaster/>);fireEvent.click(screen.getByRole('button',{name:/تعذر الحفظ/}));expect(screen.queryByText('تعذر الحفظ')).not.toBeInTheDocument()})})
