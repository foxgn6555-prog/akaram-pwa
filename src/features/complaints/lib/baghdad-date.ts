const BAGHDAD_TIME_ZONE='Asia/Baghdad'

export function baghdadDateKey(value:Date|string=new Date()):string{
 const date=typeof value==='string'?new Date(value):value
 if(Number.isNaN(date.getTime()))return''
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:BAGHDAD_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date)
 const get=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)?.value??''
 return `${get('year')}-${get('month')}-${get('day')}`
}

/** حدود يوم بغداد بصيغة UTC لاستعلامات قاعدة البيانات. بغداد UTC+3 ولا تطبق التوقيت الصيفي. */
export function baghdadDayRange(date:string):{from:string;to:string}{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('INVALID_BAGHDAD_DATE')
 const from=new Date(`${date}T00:00:00+03:00`)
 const to=new Date(from.getTime()+24*60*60*1000)
 return{from:from.toISOString(),to:to.toISOString()}
}
