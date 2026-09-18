import JSZip from 'npm:jszip@3.10.1'
import { buildPptx, composeComplaintSlides, loadImage, type ComposeItem, type LoadedPptxImage } from '../../../src/lib/pptx/complaintPptx.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors } from '../_shared/cors.ts'

type Row = Record<string, unknown>

if (import.meta.main) Deno.serve(async (request: Request) => {
  const cors = handleCors(request); if (cors) return cors
  if (request.method !== 'POST') return response({ error: 'METHOD_NOT_ALLOWED' }, 405)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  let failedReportId:string|null=null
  try {
    const jwt=(request.headers.get('authorization')??'').replace(/^Bearer\s+/i,'')
    const{data:authData}=await admin.auth.getUser(jwt);if(!authData.user)return response({error:'UNAUTHORIZED'},401)
    const{data:roles}=await admin.from('user_roles').select('role').eq('user_id',authData.user.id)
    if(!(roles??[]).some((r:{role:string})=>['complaints_officer','super_admin'].includes(r.role)))return response({error:'FORBIDDEN'},403)
    const{reportId}=await request.json() as {reportId?:string};if(!reportId)return response({error:'REPORT_REQUIRED'},400)
    const{data:report,error:reportError}=await admin.from('complaint_reports').select('*').eq('id',reportId).single()
    if(reportError||!report)return response({error:'REPORT_NOT_FOUND'},404)
    if(!['draft','quality_review','failed'].includes(report.status))return response({error:'REPORT_STATE_INVALID'},409)
    failedReportId=reportId
    const{data:links,error:linksError}=await admin.from('complaint_report_items').select('item_id,display_order,included').eq('report_id',reportId).eq('included',true).order('display_order');if(linksError)throw linksError
    const itemIds=(links??[]).map((x:{item_id:string})=>x.item_id)
    const itemResult=itemIds.length?await admin.from('complaint_items').select('*').in('id',itemIds):{data:[],error:null};if(itemResult.error)throw itemResult.error;const items=itemResult.data
    const complaintIds=[...new Set((items??[]).map((x:{complaint_id:string})=>x.complaint_id))]
    const parentResult=complaintIds.length?await admin.from('complaints').select('*').in('id',complaintIds):{data:[],error:null};if(parentResult.error)throw parentResult.error;const parents=parentResult.data
    const assignedIds=[...new Set((items??[]).map((x:{assigned_to:string|null})=>x.assigned_to).filter((value):value is string=>Boolean(value)))]
    const employeeResult=assignedIds.length?await admin.from('employees').select('user_id,full_name').in('user_id',assignedIds):{data:[],error:null};if(employeeResult.error)throw employeeResult.error
    const messageIds=[...new Set((parents??[]).map((x:{inbox_message_id:string|null})=>x.inbox_message_id).filter((value):value is string=>Boolean(value)))]
    const messageResult=messageIds.length?await admin.from('complaint_inbox_messages').select('id,subject').in('id',messageIds):{data:[],error:null};if(messageResult.error)throw messageResult.error
    const mediaResult=itemIds.length?await admin.from('complaint_media').select('item_id,media_kind,storage_path,mime_type,display_order,is_active').in('item_id',itemIds).in('media_kind',['before','after']).eq('is_active',true).order('display_order'):{data:[],error:null};if(mediaResult.error)throw mediaResult.error;const media=mediaResult.data
    const parentMap=new Map((parents??[]).map((x:{id:string})=>[x.id,x]));const itemMap=new Map((items??[]).map((x:{id:string})=>[x.id,x]));const managerMap=new Map((employeeResult.data??[]).map((x:{user_id:string;full_name:string})=>[x.user_id,x.full_name]));const messageMap=new Map((messageResult.data??[]).map((x:{id:string;subject:string|null})=>[x.id,x.subject||'بريد دون موضوع']))
    const ordered=(links??[]).map((x:{item_id:string})=>itemMap.get(x.item_id)).filter(Boolean) as Row[];if(ordered.length!==itemIds.length)throw new Error('REPORT_ITEMS_INCOMPLETE')
    // التقرير منظم دائماً حسب «البريد + مسؤول القسم»، مع الحفاظ على ترتيب الموظف داخل كل مجموعة.
    const groups=new Map<string,{subject:string;manager:string;items:Row[]}>();for(const item of ordered){const parent=parentMap.get(String(item.complaint_id)) as Row|undefined;const messageId=String(parent?.inbox_message_id??'no-message');const managerId=String(item.assigned_to??'unassigned');const key=`${messageId}:${managerId}`;const current=groups.get(key)??{subject:messageMap.get(messageId)??'بريد دون موضوع',manager:managerMap.get(managerId)??'مسؤول القسم',items:[]};current.items.push(item);groups.set(key,current)}        const layout=(report.layout??{}) as Row
    const configuredAuthority=String(layout.authorityLine??'')
    const authorityLine=!configuredAuthority||configuredAuthority==='أمانة بغداد / دائرة بلدية الكرادة'?`أمانة بغداد / دائرة بلدية ${report.sector==='karrada'?'الكرادة':'الزعفرانية'}`:configuredAuthority
    const contractorLine=String(layout.contractorLine??'تحالف شركات جزيرة الأكرام وفيرست ترايد')
    const mediaByItem=new Map<string,{before?:LoadedPptxImage;afters:LoadedPptxImage[]}>()
    for(const row of (media??[])){const loaded=await loadImage((path)=>admin.storage.from('complaint-media').download(path),String(row.storage_path),String(row.mime_type));if(!loaded)continue;const bucket=mediaByItem.get(String(row.item_id))??{afters:[]};if(row.media_kind==='before')bucket.before=loaded;else if(row.media_kind==='after')bucket.afters.push(loaded);mediaByItem.set(String(row.item_id),bucket)}
    const composeItems:ComposeItem[]=[...groups.values()].flatMap(group=>group.items.map(item=>{const parent=parentMap.get(String(item.complaint_id)) as Row|undefined;return{id:String(item.id),alley:String(item.alley??parent?.alley??'—'),neighborhood:String(item.neighborhood??parent?.neighborhood??'—'),center:String(item.municipal_center??parent?.municipal_center??'—'),title:String(item.title??parent?.complaint_type??'—'),status:String(item.status),manager:group.manager,subject:group.subject}}))
    const brand=await brandLogos()
    const slides=composeComplaintSlides({reportTitle:String(report.title),coverTitle:String(layout.title??report.title??'تقرير معالجة التلكؤات'),authorityLine,contractorLine,reportDate:String(report.report_date),sectorLabel:report.sector==='karrada'?'قاطع الكرادة':'قاطع الزعفرانية',scopeLabel:report.report_scope==='email'?'تقرير بريد مستقل':'تقرير يومي جامع',layout,items:composeItems,mediaFor:(id)=>mediaByItem.get(id)??{afters:[]},brand})
    const bytes=await buildPptx(slides,String(report.title),new JSZip())
    // اسم فريد لكل توليد يمنع المتصفح وCDN من إعادة نسخة PowerPoint قديمة من الذاكرة المؤقتة.
    const generationId=`${Date.now()}-${crypto.randomUUID().slice(0,8)}`
    const bytes=await buildPptx(slides,String(report.title));const path=`reports/${reportId}/complaints-${report.sector}-${report.report_date}-${generationId}.pptx`
    const{error:uploadError}=await admin.storage.from('complaint-media').upload(path,bytes,{contentType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',upsert:false,cacheControl:'no-cache'});if(uploadError)throw uploadError
    const{error:updateError}=await admin.from('complaint_reports').update({pptx_path:path,status:'quality_review',approved_by:null,approved_at:null,review_confirmed_at:null,reviewed_pptx_path:null,delivery_id:null}).eq('id',reportId);if(updateError)throw updateError
    return response({ok:true,path,generationId})
  }catch(error){console.error('complaint-generate-report failed',error instanceof Error?error.message:'unknown');if(failedReportId)await admin.from('complaint_reports').update({status:'failed'}).eq('id',failedReportId);return response({error:'REPORT_GENERATION_FAILED'},500)}
})


async function brandLogos():Promise<{name:string;bytes:Uint8Array}[]>{try{return await Promise.all([['brand-baghdad.png','./assets/baghdad-municipality.png'],['brand-alliance.png','./assets/alliance.png'],['brand-akaram.png','./assets/akaram.png']].map(async([name,path])=>({name:name!,bytes:await Deno.readFile(new URL(path!,import.meta.url))})))}catch{return[]}}


export { buildPptx, createPptxSmokeSlides, fitInside } from '../../../src/lib/pptx/complaintPptx.ts'
