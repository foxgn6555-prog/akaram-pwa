export type PdfPageHandler=(file:File,pageNumber:number,totalPages:number)=>Promise<void>

/** يحوّل PDF صفحة بصفحة دون حد عددي تطبيقي، مع تحرير ذاكرة كل صفحة فور رفعها. */
export async function rasterizePdfPages(url:string,baseName:string,onPage?:PdfPageHandler,signal?:AbortSignal):Promise<File[]>{
 const pdfjs=await import('pdfjs-dist')
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString()
 const response=await fetch(url);if(!response.ok)throw new Error('PDF_DOWNLOAD_FAILED')
 const task=pdfjs.getDocument({data:await response.arrayBuffer(),useWorkerFetch:false})
 const files:File[]=[]
 try{
  const document=await task.promise
  for(let pageNumber=1;pageNumber<=document.numPages;pageNumber+=1){
   if(signal?.aborted)throw new DOMException('PDF conversion cancelled','AbortError')
   const page=await document.getPage(pageNumber);const viewport=page.getViewport({scale:1.45});const canvas=globalThis.document.createElement('canvas')
   canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height)
   const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('PDF_CANVAS_FAILED')
   await page.render({canvas,canvasContext:context,viewport}).promise
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error('PDF_IMAGE_FAILED')),'image/jpeg',.88))
   const file=new File([blob],`${baseName.replace(/\.pdf$/i,'')}-page-${pageNumber}.jpg`,{type:'image/jpeg'})
   if(onPage)await onPage(file,pageNumber,document.numPages);else files.push(file)
   page.cleanup();canvas.width=1;canvas.height=1
  }
  return files
 }finally{await task.destroy()}
}
