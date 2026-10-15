import{fireEvent,render,screen}from'@testing-library/react'
import{MemoryRouter,useLocation}from'react-router'
import{describe,expect,it,vi}from'vitest'
vi.mock('@features/sector',()=>({useSectorSummary:()=>({data:{workers:10,vehicles:4,submitted_supply:2,breakdowns:1,photos:6,present_today:8,absent_today:2},isLoading:false}),useManagerProfile:()=>({data:{shift:'morning',sectors:[1]}}),useSectors:()=>({data:[{id:1,name:'الرياض'}]})}))
vi.mock('@features/sector/types',()=>({SHIFT_LABELS:{morning:'صباحي'}}))
vi.mock('@features/contractors/hooks',()=>({useManagerTeamSummary:()=>({data:[{sector_id:1,area_name:'الرياض',parent_sector:'karrada',contractor_user_id:'c1',contractor_name:'متعهد الرياض',today_headcount:10,contractor_checked_in:true,vehicles_now:4,vehicles:[]}],isLoading:false})}))
import ManagerDashboard from'@portals/manager/pages/Dashboard/ManagerDashboard'
function Path(){return <span data-testid="path">{useLocation().pathname}</span>}
describe('لوحة مسؤول القسم',()=>{it('تعرض بطاقات ملونة ورسم الحضور ووحدات العمل',()=>{render(<MemoryRouter initialEntries={['/manager']}><ManagerDashboard/><Path/></MemoryRouter>);expect(screen.getByTestId('mgr-stats')).toHaveTextContent('العدد اليوم (المتعهد وعماله)');expect(screen.getByTestId('mgr-stats')).toHaveTextContent('متعهد: متعهد الرياض');expect(screen.getByTestId('mgr-stats')).toHaveTextContent('آليات تعمل الآن');expect(screen.getByText('حالة الحضور اليوم')).toBeInTheDocument();expect(screen.getByText('100%')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:/حركة الآليات/}));expect(screen.getByTestId('path')).toHaveTextContent('/manager/vehicle-trips')})})
