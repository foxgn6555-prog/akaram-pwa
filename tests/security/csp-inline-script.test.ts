import{createHash}from'node:crypto';import{readFileSync}from'node:fs';import{describe,expect,it}from'vitest'
const html=readFileSync('index.html','utf8')
describe('CSP وسكربت الحماية من الإطارات',()=>{
 it('يسمح فقط ببصمة السكربت المضمّن الفعلية ولا يحتاج unsafe-inline',()=>{
  const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];expect(source).toBeTruthy()
  const hash=`sha256-${createHash('sha256').update(source!).digest('base64')}`
  expect(html).toContain(`script-src 'self' '${hash}'`)
  expect(html.match(/script-src[^;]+/)?.[0]).not.toContain("'unsafe-inline'")
 })
 it('يسمح بعامل PDF.js المحلي وBlob دون توسيع مصادر السكربت',()=>{
  expect(html).toContain("worker-src 'self' blob:")
  expect(html.match(/worker-src[^;]+/)?.[0]).not.toContain('*')
 })
})
