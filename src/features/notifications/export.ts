import type { PushDeliveryRow } from '@sdk/notifications.sdk'

const categoryLabels: Record<PushDeliveryRow['category'], string> = {
  system: 'النظام',
  departure: 'الانطلاقيات',
  maintenance: 'الصيانة',
  garage: 'الكراج',
  station: 'المحطة',
  gps: 'نظام تحديد المواقع',
  complaints: 'الشكاوى',
  security: 'الأمان',
}
const statusLabels: Record<PushDeliveryRow['status'], string> = {
  pending: 'بانتظار الإرسال',
  processing: 'قيد الإرسال',
  sent: 'تم الإرسال',
  failed: 'فشل',
  cancelled: 'ملغى',
}
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('ar-IQ', {
        dateStyle: 'short',
        timeStyle: 'medium',
        timeZone: 'Asia/Baghdad',
      }).format(new Date(value))
    : 'غير متوفر'

export async function exportPushDeliveries(rows: PushDeliveryRow[]) {
  const ExcelJS = await import('exceljs'),
    workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet('مراقبة Web Push', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }],
    })
  workbook.creator = 'منصة الأكرم — التطوير المركزي'
  workbook.created = new Date()
  sheet.mergeCells('A1:L1')
  sheet.getCell('A1').value = 'تقرير مراقبة تسليم إشعارات Web Push'
  sheet.getCell('A1').font = { bold: true, size: 17, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } }
  sheet.getCell('A1').alignment = { horizontal: 'center' }
  sheet.mergeCells('A2:L2')
  sheet.getCell('A2').value =
    `توقيت بغداد · ${date(new Date().toISOString())} · لا يتضمن التقرير عناوين الاشتراك أو مفاتيح الأجهزة`
  sheet.getCell('A2').alignment = { horizontal: 'center' }
  sheet.columns = [
    { key: 'title', width: 34 },
    { key: 'category', width: 18 },
    { key: 'priority', width: 14 },
    { key: 'device', width: 25 },
    { key: 'platform', width: 16 },
    { key: 'status', width: 19 },
    { key: 'attempts', width: 14 },
    { key: 'http', width: 12 },
    { key: 'created', width: 24 },
    { key: 'sent', width: 24 },
    { key: 'interaction', width: 18 },
    { key: 'clicked', width: 24 },
  ]
  const headers = [
    'الإشعار',
    'التصنيف',
    'الأولوية',
    'الجهاز',
    'المنصة',
    'حالة التسليم',
    'عدد المحاولات',
    'رمز HTTP',
    'وقت الإنشاء',
    'وقت الإرسال',
    'تفاعل المستخدم',
    'وقت التفاعل',
  ]
  headers.forEach((header, index) => (sheet.getRow(3).getCell(index + 1).value = header))
  sheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
  rows.forEach((row) =>
    sheet.addRow({
      title: row.title,
      category: categoryLabels[row.category],
      priority:
        row.priority === 'critical'
          ? 'حرجة'
          : row.priority === 'high'
            ? 'عالية'
            : row.priority === 'normal'
              ? 'اعتيادية'
              : 'منخفضة',
      device: row.device_name ?? 'غير مسمى',
      platform:
        row.platform === 'ios'
          ? 'iPhone / iPad'
          : row.platform === 'android'
            ? 'Android'
            : row.platform === 'windows'
              ? 'Windows'
              : row.platform === 'macos'
                ? 'macOS'
                : row.platform === 'linux'
                  ? 'Linux'
                  : 'غير محدد',
      status: statusLabels[row.status],
      attempts: row.attempts,
      http: row.last_http_status ?? 'غير متوفر',
      created: date(row.created_at),
      sent: date(row.sent_at),
      interaction: row.clicked_at ? 'تم فتح الإشعار' : 'لم يفتح الإشعار',
      clicked: date(row.clicked_at),
    }),
  )
  sheet.autoFilter = { from: 'A3', to: 'L3' }
  sheet.eachRow((row, rowNumber) => {
    row.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true }
    if (rowNumber > 3 && rowNumber % 2 === 0)
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FF' } }
  })
  const bytes = await workbook.xlsx.writeBuffer(),
    blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    url = URL.createObjectURL(blob),
    link = document.createElement('a')
  link.href = url
  link.download = `مراقبة-Web-Push-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
