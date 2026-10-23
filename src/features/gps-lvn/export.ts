import type { GpsAlertEscalationHistory, GpsOperationalAlert } from '@sdk/gps-lvn.sdk'

const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('ar-IQ-u-nu-latn', {
        dateStyle: 'short',
        timeStyle: 'medium',
        timeZone: 'Asia/Baghdad',
      }).format(new Date(value))
    : 'غير متوفر'

export async function exportGpsAlerts(
  alerts: GpsOperationalAlert[],
  escalations: GpsAlertEscalationHistory[] = [],
) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'شركة جزيرة الأكارم — غرفة العمليات'
  const sheet = workbook.addWorksheet('تنبيهات GPS', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  })
  sheet.columns = [
    { header: 'التنبيه', key: 'title', width: 34 },
    { header: 'الآلية', key: 'vehicle', width: 24 },
    { header: 'رقم DB', key: 'db', width: 12 },
    { header: 'النوع', key: 'type', width: 18 },
    { header: 'الأولوية', key: 'severity', width: 14 },
    { header: 'أول اكتشاف', key: 'opened', width: 24 },
    { header: 'آخر اكتشاف', key: 'last', width: 24 },
    { header: 'عدد التكرار', key: 'count', width: 16 },
    { header: 'الإقرار', key: 'ack', width: 20 },
    { header: 'ضمن انطلاقية', key: 'trip', width: 18 },
  ]
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBE123C' } }
  const typeLabel = {
    gps_offline: 'انقطاع GPS',
    gps_stale: 'تأخر القراءة',
    outside_zone: 'خارج الزون',
    route_deviation: 'خرجت من مسارها',
    engine_idle: 'توقف المحرك',
  }
  alerts.forEach((alert) =>
    sheet.addRow({
      title: alert.title,
      vehicle: alert.vehicle_name ?? alert.device_name,
      db: alert.db_number ?? 'غير مربوط',
      type: typeLabel[alert.alert_type],
      severity:
        alert.severity === 'critical' ? 'حرجة' : alert.severity === 'warning' ? 'تحذير' : 'معلومات',
      opened: date(alert.opened_at),
      last: date(alert.last_detected_at),
      count: alert.occurrence_count,
      ack: alert.acknowledged_at ? `تم ${date(alert.acknowledged_at)}` : 'غير مقر',
      trip: alert.departure_id ? 'نعم' : 'لا',
    }),
  )
  if (escalations.length) {
    const history = workbook.addWorksheet('سجل التصعيد', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    })
    history.columns = [
      { header: 'معرف التنبيه', key: 'alert', width: 38 },
      { header: 'المستوى', key: 'level', width: 12 },
      { header: 'وقت الإرسال', key: 'sent', width: 24 },
      { header: 'حالة القراءة', key: 'read', width: 16 },
      { header: 'وقت القراءة', key: 'readAt', width: 24 },
      { header: 'تم الإخفاء', key: 'dismissed', width: 24 },
    ]
    history.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    history.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }
    escalations.forEach((item) =>
      history.addRow({
        alert: item.alert_id,
        level: item.level,
        sent: date(item.created_at),
        read: item.is_read ? 'مقروء' : 'غير مقروء',
        readAt: date(item.read_at),
        dismissed: date(item.dismissed_at),
      }),
    )
  }
  const bytes = await workbook.xlsx.writeBuffer()
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob),
    link = document.createElement('a')
  link.href = url
  link.download = `تنبيهات-GPS-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
