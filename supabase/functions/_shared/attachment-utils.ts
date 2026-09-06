export async function mapConcurrent<T>(values:T[],limit:number,worker:(value:T,index:number)=>Promise<void>):Promise<void>{
  if(!Number.isInteger(limit)||limit<1)throw new Error('CONCURRENCY_LIMIT_INVALID')
  let cursor=0;let firstError:unknown=null
  await Promise.all(Array.from({length:Math.min(limit,values.length)},async()=>{
    while(cursor<values.length){const index=cursor++;try{await worker(values[index]!,index)}catch(error){firstError??=error}}
  }))
  if(firstError)throw firstError
}

export function attachmentMime(file:Pick<File,'name'>,bytes:Uint8Array):string|null{
  if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg'
  if(bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47)return'image/png'
  if(bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50)return'image/webp'
  if(bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46)return'application/pdf'
  if(bytes[0]===0x50&&bytes[1]===0x4b&&/\.pptx$/i.test(file.name))return'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  return null
}
