export async function rasterizePdfPages(url: string, baseName: string): Promise<File[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const source = await fetch(url).then(async (response) => {
    if (!response.ok) throw new Error('PDF_DOWNLOAD_FAILED')
    return response.arrayBuffer()
  })
  const task = pdfjs.getDocument({ data: source, useWorkerFetch: false })
  const pdfDocument = await task.promise
  if (pdfDocument.numPages > 50) throw new Error('PDF_TOO_MANY_PAGES')
  const files: File[] = []
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1.8 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('PDF_CANVAS_FAILED')
    await page.render({ canvas, canvasContext: context, viewport }).promise
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (result: Blob | null) => result ? resolve(result) : reject(new Error('PDF_IMAGE_FAILED')), 'image/png',
    ))
    files.push(new File([blob], `${baseName.replace(/\.pdf$/i, '')}-page-${pageNumber}.png`, { type: 'image/png' }))
    page.cleanup()
  }
  await task.destroy()
  return files
}
