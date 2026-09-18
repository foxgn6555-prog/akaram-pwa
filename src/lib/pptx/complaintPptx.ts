/**
 * بانٍ مشترك لملف PowerPoint الخاص بتقارير الشكاوى — يعمل في المتصفح وفي دالة
 * الحافة معاً حتى يكون الملف المنزل مطابقاً حرفياً للمعاينة والتصميم المعتمد:
 * غلاف بالشعارات الثلاثة ← صفحات الجدول (11 صفاً) ← شرائح قبل/بعد
 * مع شريط التذييل «محلة - زقاق - نوع».
 */
export const EMU = 914400
export type SlidePart = { xml: string; rels: string; images: { name: string; bytes: Uint8Array }[] }

/** أي ضاغطة حزم توافق JSZip (تُحقن حتى يعمل الباني في Deno والمتصفح معاً). */
export interface PptxZip {
  file(name: string, data: string | Uint8Array): unknown
  generateAsync(options: { type: 'uint8array'; compression?: 'DEFLATE' | 'STORE' }): Promise<Uint8Array>
}

export interface LoadedPptxImage { bytes: Uint8Array; width: number; height: number; ext: 'png' | 'jpg' | 'webp' }
export interface ComposeBrandImage { name: string; bytes: Uint8Array }
export interface ComposeItem { id: string; alley: string; neighborhood: string; center: string; title: string; status: string; manager: string; subject: string }
export interface ComposeInput {
  reportTitle: string
  coverTitle: string
  authorityLine: string
  contractorLine: string
  reportDate: string
  sectorLabel: string
  scopeLabel: string
  layout: Record<string, unknown>
  items: ComposeItem[]
  mediaFor: (itemId: string) => { before?: LoadedPptxImage; afters: LoadedPptxImage[] }
  brand: ComposeBrandImage[]
}

export const TABLE_ROWS_PER_SLIDE = 11

/** القاعدة المشتركة لسطر الجهة الحكومية حسب القطاع (معاينة ومتصفح وحافة). */
export const authorityLineFor = (layout: Record<string, unknown>, sector: string) => {
  const configured = String(layout.authorityLine ?? '')
  return !configured || configured === 'أمانة بغداد / دائرة بلدية الكرادة'
    ? `أمانة بغداد / دائرة بلدية ${sector === 'karrada' ? 'الكرادة' : 'الزعفرانية'}`
    : configured
}

function makeSlide(parts:string[],rels:string[]=[],images:{name:string;bytes:Uint8Array}[]=[]):SlidePart{return{xml:`<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${group()}${parts.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,rels:relsXml(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${rels.join('')}`),images}}
let shapeId=2;function textBox(t:string,x:number,y:number,w:number,h:number,size:number,bold:boolean,color:string,font='Arial'){const id=shapeId++;return`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x,y,w,h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr" rtl="1"/><a:r><a:rPr lang="ar-IQ" sz="${size*100}" b="${bold?1:0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${font}"/><a:cs typeface="${font}"/></a:rPr><a:t>${esc(t)}</a:t></a:r><a:endParaRPr lang="ar-IQ"/></a:p></p:txBody></p:sp>`}
function rect(x:number,y:number,w:number,h:number,fill:string,line:string){const id=shapeId++;return`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x,y,w,h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln></p:spPr></p:sp>`}
function roundRect(x:number,y:number,w:number,h:number,fill:string,line:string,lineWidth=2){const id=shapeId++;return`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Rounded Frame ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x,y,w,h)}<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln w="${lineWidth*12700}"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln></p:spPr></p:sp>`}
function picture(rid:string,x:number,y:number,w:number,h:number,n:number){const id=shapeId++;return`<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${n}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(x,y,w,h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`}
function xfrm(x:number,y:number,w:number,h:number){return`<a:xfrm><a:off x="${Math.round(x*EMU)}" y="${Math.round(y*EMU)}"/><a:ext cx="${Math.round(w*EMU)}" cy="${Math.round(h*EMU)}"/></a:xfrm>`}function group(){return'<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'}function relsXml(v:string){return`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${v}</Relationships>`}function esc(v:unknown){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!))}
function clamp(value:number,min:number,max:number){return Number.isFinite(value)?Math.min(max,Math.max(min,value)):min}
function safeColor(value:unknown,fallback:string){const color=String(value??'').replace('#','').toUpperCase();return /^[0-9A-F]{6}$/.test(color)?color:fallback}
function safeFont(value:unknown){const font=String(value??'Arial');return ['Arial','Tahoma','Calibri'].includes(font)?font:'Arial'}
export async function loadImage(download:(path:string)=>Promise<{data:Blob|null;error:unknown}>,path:string,mime:string){if(!['image/jpeg','image/png','image/webp'].includes(mime))return null;const{data,error}=await download(path);if(error||!data)return null;const bytes=new Uint8Array(await data.arrayBuffer());if(!validMagic(bytes,mime))return null;const dimensions=imageDimensions(bytes,mime);return{bytes,ext:mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg',width:dimensions?.width??1,height:dimensions?.height??1}}export function fitInside(x:number,y:number,w:number,h:number,imageW:number,imageH:number){const imageRatio=imageW/imageH;const boxRatio=w/h;if(imageRatio>boxRatio){const fittedH=w/imageRatio;return{x,y:y+(h-fittedH)/2,w,h:fittedH}}const fittedW=h*imageRatio;return{x:x+(w-fittedW)/2,y,w:fittedW,h}}export function imageDimensions(bytes:Uint8Array,mime:string):{width:number;height:number}|null{if(mime==='image/png'&&bytes.length>=24){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return{width:view.getUint32(16),height:view.getUint32(20)}}if(mime==='image/jpeg'){for(let offset=2;offset+9<bytes.length;){if(bytes[offset]!==0xff){offset++;continue}const marker=bytes[offset+1]??0;const length=((bytes[offset+2]??0)<<8)+(bytes[offset+3]??0);if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return{height:((bytes[offset+5]??0)<<8)+(bytes[offset+6]??0),width:((bytes[offset+7]??0)<<8)+(bytes[offset+8]??0)};if(length<2)break;offset+=2+length}}return null}export function validMagic(b:Uint8Array,m:string){if(m==='image/png')return b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47;if(m==='image/webp')return b[0]===0x52&&b[1]===0x49&&b[2]===0x46&&b[3]===0x46&&b[8]===0x57&&b[9]===0x45&&b[10]===0x42&&b[11]===0x50;return b[0]===0xff&&b[1]===0xd8&&b[2]===0xff}function theme(){return'<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Akaram"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="5B9BD5"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="4472C4"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Arial"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="35000"><a:schemeClr val="phClr"><a:tint val="37000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="15000"/><a:satMod val="350000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="1"/></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:shade val="51000"/><a:satMod val="130000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="94000"/><a:satMod val="135000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="0"/></a:gradFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"><a:shade val="95000"/><a:satMod val="105000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="40000"/><a:satMod val="350000"/></a:schemeClr></a:gs><a:gs pos="40000"><a:schemeClr val="phClr"><a:tint val="45000"/><a:shade val="99000"/><a:satMod val="350000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="20000"/><a:satMod val="255000"/></a:schemeClr></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="-80000" r="50000" b="180000"/></a:path></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="80000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="30000"/><a:satMod val="200000"/></a:schemeClr></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>'}export async function buildPptx(slides:SlidePart[],title:string,zip:PptxZip){const overrides=slides.map((_,i)=>`<Override PartName="/ppt/slides/slide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');zip.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${overrides}</Types>`);zip.file('_rels/.rels',relsXml('<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'));zip.file('docProps/core.xml',`<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title><dc:creator>شركة جزيرة الأكرام</dc:creator></cp:coreProperties>`);zip.file('ppt/presentation.xml',`<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_,i)=>`<p:sldId id="${256+i}" r:id="rId${i+2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);zip.file('ppt/_rels/presentation.xml.rels',relsXml(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_,i)=>`<Relationship Id="rId${i+2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i+1}.xml"/>`).join('')}`));zip.file('ppt/slideMasters/slideMaster1.xml',`<?xml version="1.0"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${group()}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels',relsXml('<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>'));zip.file('ppt/slideLayouts/slideLayout1.xml',`<?xml version="1.0"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree>${group()}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels',relsXml('<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'));zip.file('ppt/theme/theme1.xml',theme());slides.forEach((s,i)=>{zip.file(`ppt/slides/slide${i+1}.xml`,s.xml);zip.file(`ppt/slides/_rels/slide${i+1}.xml.rels`,s.rels);s.images.forEach(im=>zip.file(`ppt/media/${im.name}`,im.bytes))});return zip.generateAsync({type:'uint8array',compression:'DEFLATE'})}
export function createPptxSmokeSlides():SlidePart[]{return[makeSlide([textBox('اختبار تقرير الشكاوى',1,1,10,1,24,true,'000000')])]}

let mediaCounter = 1

/** يبني شرائح التقرير كاملة بالترتيب نفسه الذي تعرضه المعاينة البصرية. */
export function composeComplaintSlides(input: ComposeInput): SlidePart[] {
  shapeId = 2
  mediaCounter = 1
  const layout = input.layout
  const accent = safeColor(layout.accent, 'D269C8')
  const beforeLabel = String(layout.beforeLabel ?? 'صورة التلكؤ / الشكوى')
  const afterLabel = String(layout.afterLabel ?? 'صورة المعالجة')
  const coverTitle = String(input.coverTitle || 'تقرير معالجة التلكؤات')
  const coverFontSize = clamp(Number(layout.coverFontSize ?? 30), 20, 42)
  const imageHeight = clamp(Number(layout.imageHeight ?? 4.8), 3, 4.8)
  const fontFamily = safeFont(layout.fontFamily)
  const slides: SlidePart[] = []

  // 1) الغلاف — ترتيب الشعارات كما في التصميم: يسار الأكرام، وسط التحالف، يمين أمانة بغداد
  const coverShapes = [roundRect(.55, .4, 12.2, 6.65, 'FFFFFF', accent, 4),
    textBox(input.authorityLine, 2.1, 2.28, 9.1, .42, 17, true, '111111', fontFamily),
    textBox(input.contractorLine, 2.1, 2.78, 9.1, .42, 17, true, '111111', fontFamily),
    textBox(coverTitle, 1.2, 3.2, 10.9, .65, coverFontSize, true, accent, fontFamily),
    textBox(input.reportTitle, 1.4, 3.92, 10.5, .42, 16, true, '1E293B', fontFamily),
    textBox(`${input.sectorLabel} - ${input.reportDate}`, 4.3, 4.55, 4.7, .42, 17, true, '111111', fontFamily),
    textBox(input.scopeLabel, 4.3, 5.32, 4.7, .3, 10, false, '64748B', fontFamily)]
  if (input.brand.length === 3) {
    coverShapes.push(picture('rId4', 4.93, 1.02, .92, .9, 9003), picture('rId3', 5.98, 1.02, 1.05, .9, 9002), picture('rId2', 7.13, 1.08, .78, .78, 9001))
  }
  const brandRels = input.brand.map((logo, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${logo.name}"/>`)
  slides.push(makeSlide(coverShapes, brandRels, input.brand))

  // 3) صفحات الجدول — 11 صفاً لكل شريحة، والعناوين وحدها بالخط العريض
  const headers = ['الزقاق', 'المحلة', 'المركز', 'نوع التلكؤ', 'مسؤول القسم', 'ت']
  const widths = [1.35, 1.35, 2, 2.7, 3.25, .75]
  for (let start = 0; start < input.items.length || start === 0; start += TABLE_ROWS_PER_SLIDE) {
    const slice = input.items.slice(start, start + TABLE_ROWS_PER_SLIDE)
    const shapes = [textBox('جدول بيانات التلكؤات', 3.25, .18, 6.8, .45, 20, true, accent, fontFamily)]
    const rows = [headers, ...slice.map((item, index) => [item.alley, item.neighborhood, item.center, item.title, item.manager, String(start + index + 1)])]
    rows.forEach((row, ri) => {
      let x = .6
      row.forEach((cell, ci) => {
        const width = widths[ci] ?? 1
        const fill = ri === 0 ? accent : ri % 2 === 0 ? 'F8FAFC' : 'FFFFFF'
        shapes.push(rect(x, .78 + ri * .5, width, .5, fill, 'E2E8F0'))
        shapes.push(textBox(cell, x, .84 + ri * .5, width, .34, 10, ri === 0, ri === 0 ? 'FFFFFF' : '111111', fontFamily))
        x += width
      })
    })
    if (start + TABLE_ROWS_PER_SLIDE < input.items.length) shapes.push(textBox(`+ ${input.items.length - start - TABLE_ROWS_PER_SLIDE} موقع في الصفحات التالية`, 4.3, .78 + (slice.length + 1) * .5 + .08, 4.7, .3, 11, false, '64748B', fontFamily))
    slides.push(makeSlide(shapes))
  }

  // 4) شرائح قبل/بعد لكل موقع بإطارات البطاقات وشريط التذييل
  for (const item of input.items) {
    const media = input.mediaFor(item.id)
    const pages: Array<LoadedPptxImage | undefined> = media.afters.length ? media.afters : [undefined]
    for (let afterIndex = 0; afterIndex < pages.length; afterIndex += 1) {
      const after = pages[afterIndex]
      const images: { name: string; bytes: Uint8Array }[] = []
      const rels: string[] = []
      const afterTitle = pages.length > 1 ? `${afterLabel} ${afterIndex + 1} من ${pages.length}` : afterLabel
      const shapes = [rect(.4, .2, 6.1, .45, accent, accent), rect(6.65, .2, 6.1, .45, accent, accent),
        textBox(beforeLabel, .4, .25, 6.1, .3, 14, true, 'FFFFFF'), textBox(afterTitle, 6.65, .25, 6.1, .3, 14, true, 'FFFFFF'),
        rect(.5, .75, 5.9, imageHeight + .4, 'FFFFFF', 'CBD5E1'), rect(6.8, .75, 5.9, imageHeight + .4, 'FFFFFF', 'CBD5E1')]
      const slots: Array<[LoadedPptxImage | undefined, number, string]> = [[after, 6.9, 'لم تتم المعالجة بعد'], [media.before, .65, 'الصورة غير متاحة']]
      for (const [image, x, missing] of slots) {
        if (image) {
          const relationId = images.length + 2
          const imageNo = mediaCounter++
          images.push({ name: `image${imageNo}.${image.ext}`, bytes: image.bytes })
          rels.push(`<Relationship Id="rId${relationId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${imageNo}.${image.ext}"/>`)
          const fitted = fitInside(x, 1.15, 5.6, imageHeight, image.width, image.height)
          shapes.push(rect(x, 1.15, 5.6, imageHeight, 'F8FAFC', 'CBD5E1'), picture(`rId${relationId}`, fitted.x, fitted.y, fitted.w, fitted.h, imageNo))
        } else {
          shapes.push(textBox(missing, x, 2.8, 5.6, .5, 18, true, 'C00000'))
        }
      }
      shapes.push(rect(3.05, 6.55, 7.2, .5, 'F1F5F9', 'E2E8F0'), textBox(`محلة ${item.neighborhood} - زقاق ${item.alley} - ${item.title}`, 3.15, 6.62, 7, .34, 12.5, true, '0F172A', fontFamily))
      slides.push(makeSlide(shapes, rels, images))
    }
  }
  return slides
}
