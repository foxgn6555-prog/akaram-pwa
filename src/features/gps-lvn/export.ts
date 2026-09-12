import type {
  GpsAlertEscalationHistory,
  GpsOperationalAlert,
  GpsTripHistory,
  GpsTripRouteDiagnostic,
  GpsTripRouteEvent,
  GpsTripRouteMetric,
  GpsTripShiftExportContext,
  GpsTripWindowCoverageAudit,
  GpsTripZoneEvent,
  GpsTripInvestigation,
  GpsZoneEvent,
} from '@sdk/gps-lvn.sdk'

const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('ar-IQ', {
        dateStyle: 'short',
        timeStyle: 'medium',
        timeZone: 'Asia/Baghdad',
      }).format(new Date(value))
    : 'غير متوفر'

export async function exportGpsTrips(
  trips: GpsTripHistory[],
  zoneEvents: GpsZoneEvent[] = [],
  shiftContexts: GpsTripShiftExportContext[] = [],
  routeMetrics: GpsTripRouteMetric[] = [],
  routeEvents: GpsTripRouteEvent[] = [],
  diagnostics: GpsTripRouteDiagnostic[] = [],
  windowAudits: GpsTripWindowCoverageAudit[] = [],
  tripZoneEvents: GpsTripZoneEvent[] = [],
  investigations: GpsTripInvestigation[] = [],
) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'منصة الأكرم — غرفة العمليات'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('الانطلاقيات والمسارات', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }],
  })
  sheet.mergeCells('A1:T1')
  sheet.getCell('A1').value = 'تقرير سلامة انطلاقيات ومسارات GPS'
  sheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF071827' } }
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 34
  sheet.mergeCells('A2:T2')
  sheet.getCell('A2').value = `توقيت بغداد · تاريخ التصدير: ${date(new Date().toISOString())}`
  sheet.getCell('A2').alignment = { horizontal: 'center' }
  const headers = [
    'الآلية',
    'رقم DB',
    'السائق',
    'وقت الانطلاق',
    'وقت العودة',
    'المدة بالدقائق',
    'الحركة المنتجة بالدقائق',
    'التوقف بالدقائق',
    'عدد التوقفات',
    'نقاط GPS',
    'أول قراءة',
    'آخر قراءة',
    'نسبة التغطية',
    'حالة التغطية',
    'عدد الانقطاعات',
    'أكبر انقطاع بالدقائق',
    'نقاط LVN',
    'النقاط المخزنة',
    'حالة التدقيق',
    'آخر تدقيق',
  ]
  const widths = [22, 12, 20, 23, 23, 16, 20, 16, 15, 13, 23, 23, 15, 16, 16, 21, 13, 16, 15, 23]
  sheet.columns = widths.map((width, index) => ({ key: `c${index}`, width }))
  const headerRow = sheet.getRow(3)
  headers.forEach((header, index) => (headerRow.getCell(index + 1).value = header))
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } }
  const metricByTrip = new Map(routeMetrics.map((metric) => [metric.departure_id, metric]))
  trips.forEach((trip) => {
    const metric = metricByTrip.get(trip.departure_id),
      coverage =
        trip.gps_coverage === 'covered'
          ? 'مكتملة'
          : trip.gps_coverage === 'partial'
            ? 'جزئية'
            : trip.gps_coverage === 'unbound'
              ? 'الجهاز غير مربوط'
              : 'لا توجد بيانات GPS'
    sheet.addRow([
      trip.vehicle_name,
      trip.db_number,
      trip.driver_name,
      date(trip.departed_at),
      date(trip.returned_at),
      Math.round(trip.total_seconds / 60),
      Math.round((metric?.moving_seconds ?? 0) / 60),
      Math.round((metric?.stopped_seconds ?? 0) / 60),
      metric?.stop_count ?? 0,
      trip.gps_points,
      date(trip.first_fix),
      date(trip.last_fix),
      Number(trip.coverage_percent),
      coverage,
      trip.gap_count,
      Math.round(trip.largest_gap_seconds / 60),
      trip.source_points ?? 'غير مدقق',
      trip.stored_points ?? 'غير مدقق',
      trip.last_import_status === 'success'
        ? 'ناجح'
        : trip.last_import_status === 'partial'
          ? 'جزئي'
          : trip.last_import_status === 'failed'
            ? 'فشل'
            : 'لم ينفذ',
      date(trip.imported_at),
    ])
  })
  sheet.autoFilter = { from: 'A3', to: 'T3' }
  sheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true }
    if (rowNumber > 3 && rowNumber % 2 === 0)
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } }
  })
  if (zoneEvents.length) {
    const zones = workbook.addWorksheet('دخول وخروج الزونات', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    })
    zones.columns = [
      { header: 'الحدث', key: 'event', width: 14 },
      { header: 'الوقت', key: 'time', width: 24 },
      { header: 'الآلية', key: 'vehicle', width: 24 },
      { header: 'رقم DB', key: 'db', width: 14 },
      { header: 'الزون', key: 'zone', width: 24 },
      { header: 'ضمن انطلاقية', key: 'trip', width: 18 },
      { header: 'خط العرض', key: 'lat', width: 16 },
      { header: 'خط الطول', key: 'lng', width: 16 },
    ]
    zones.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    zones.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } }
    zoneEvents.forEach((event) =>
      zones.addRow({
        event: event.event_type === 'enter' ? 'دخول الزون' : 'خروج من الزون',
        time: date(event.occurred_at),
        vehicle: event.vehicle_name ?? event.device_name,
        db: event.db_number ?? 'غير مربوط',
        zone: event.geofence_name,
        trip: event.departure_id ? 'نعم' : 'لا',
        lat: event.latitude,
        lng: event.longitude,
      }),
    )
  }
  if (routeEvents.length) {
    const events = workbook.addWorksheet('محطات المسار', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    })
    events.columns = [
      { header: 'معرف الانطلاقية', key: 'trip', width: 38 },
      { header: 'نوع المحطة', key: 'type', width: 18 },
      { header: 'البداية', key: 'from', width: 24 },
      { header: 'النهاية', key: 'to', width: 24 },
      { header: 'المدة بالدقائق', key: 'minutes', width: 18 },
      { header: 'العنوان', key: 'address', width: 38 },
      { header: 'خط العرض', key: 'lat', width: 16 },
      { header: 'خط الطول', key: 'lng', width: 16 },
    ]
    events.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    events.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0369A1' } }
    routeEvents.forEach((event) =>
      events.addRow({
        trip: event.departure_id,
        type: event.event_type === 'stop' ? 'توقف تشغيلي' : 'انقطاع GPS',
        from: date(event.event_start),
        to: date(event.event_end),
        minutes: Math.round(event.duration_seconds / 60),
        address: event.address ?? 'العنوان غير متوفر',
        lat: event.latitude,
        lng: event.longitude,
      }),
    )
  }
  if (shiftContexts.length) {
    const shifts = workbook.addWorksheet('شفتات وسائقو الانطلاقية', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    })
    shifts.columns = [
      { header: 'معرف الانطلاقية', key: 'trip', width: 38 },
      { header: 'الشفت', key: 'shift', width: 14 },
      { header: 'السائق', key: 'driver', width: 24 },
      { header: 'المنطقة', key: 'area', width: 22 },
      { header: 'بداية التداخل', key: 'from', width: 24 },
      { header: 'نهاية التداخل', key: 'to', width: 24 },
      { header: 'مدة التداخل بالدقائق', key: 'minutes', width: 22 },
      { header: 'سائق بداية الانطلاقية', key: 'primary', width: 24 },
    ]
    shifts.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    shifts.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }
    shiftContexts.forEach((context) =>
      shifts.addRow({
        trip: context.departure_id,
        shift:
          context.shift === 'morning' ? 'صباحي' : context.shift === 'evening' ? 'مسائي' : 'ليلي',
        driver: context.driver_name,
        area: context.area_name,
        from: date(context.overlap_from),
        to: date(context.overlap_to),
        minutes: Math.round(context.overlap_seconds / 60),
        primary: context.is_departure_driver ? 'نعم' : 'لا',
      }),
    )
  }
  if (diagnostics.length) {
    const diagnosis = workbook.addWorksheet('تشخيص نقص المسارات', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    })
    diagnosis.columns = [
      { header: 'معرف الانطلاقية', key: 'trip', width: 38 },
      { header: 'التشخيص', key: 'diagnosis', width: 28 },
      { header: 'نوافذ 72 ساعة المطلوبة', key: 'windows', width: 24 },
      { header: 'تأخر أول قراءة بالدقائق', key: 'leading', width: 24 },
      { header: 'نقص نهاية المسار بالدقائق', key: 'trailing', width: 26 },
      { header: 'الفجوات الداخلية', key: 'gaps', width: 18 },
      { header: 'نوافذ LVN المكتملة', key: 'chunks', width: 20 },
      { header: 'المستلم من LVN', key: 'source', width: 18 },
      { header: 'الصالح', key: 'valid', width: 14 },
      { header: 'المخزن', key: 'stored', width: 14 },
      { header: 'المرفوض', key: 'rejected', width: 14 },
      { header: 'رمز الفشل الآمن', key: 'error', width: 24 },
    ]
    const labels: Record<GpsTripRouteDiagnostic['diagnosis_code'], string> = {
      unbound: 'الجهاز غير مربوط',
      import_failed: 'فشل الاستيراد من LVN',
      no_data: 'لا توجد قراءات',
      provider_payload_rejected: 'بيانات مرفوضة من المصدر',
      storage_deficit: 'نقص بين الصالح والمخزن',
      late_first_fix: 'تأخر أول تثبيت GPS',
      early_last_fix: 'انتهت القراءات مبكراً',
      internal_gaps: 'فجوات داخل المسار',
      windows_not_fully_imported: 'نوافذ لم تُستورد',
      healthy: 'المسار سليم',
    }
    diagnosis.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    diagnosis.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C2D12' } }
    diagnostics.forEach((row) =>
      diagnosis.addRow({
        trip: row.departure_id,
        diagnosis: labels[row.diagnosis_code],
        windows: row.expected_72h_windows,
        leading: Math.round(row.leading_gap_seconds / 60),
        trailing: Math.round(row.trailing_gap_seconds / 60),
        gaps: row.internal_gap_count,
        chunks: `${row.chunks_completed ?? 0} من ${row.chunks_requested ?? 0}`,
        source: row.source_points ?? 0,
        valid: row.valid_points ?? 0,
        stored: row.stored_points ?? 0,
        rejected: row.rejected_points ?? 0,
        error: row.error_code ?? 'لا يوجد',
      }),
    )
  }
  if (windowAudits.length) {
    const audit = workbook.addWorksheet('تدقيق نوافذ المسار', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    })
    audit.columns = [
      { header: 'النافذة', key: 'window', width: 12 },
      { header: 'من', key: 'from', width: 23 },
      { header: 'إلى', key: 'to', width: 23 },
      { header: 'حالة الاستيراد', key: 'status', width: 18 },
      { header: 'المستلم من LVN', key: 'source', width: 18 },
      { header: 'الصالح بعد التنقية', key: 'valid', width: 20 },
      { header: 'المرفوض', key: 'rejected', width: 14 },
      { header: 'المخزن الفعلي', key: 'stored', width: 18 },
      { header: 'القابل للرسم', key: 'renderable', width: 18 },
      { header: 'قبول المصدر ٪', key: 'acceptance', width: 18 },
      { header: 'مطابقة التخزين ٪', key: 'storage', width: 19 },
      { header: 'تغطية الزمن ٪', key: 'coverage', width: 18 },
      { header: 'فجوة البداية بالدقائق', key: 'leading', width: 23 },
      { header: 'فجوة النهاية بالدقائق', key: 'trailing', width: 23 },
      { header: 'الفجوات الداخلية', key: 'gaps', width: 19 },
      { header: 'أكبر فجوة بالدقائق', key: 'largest', width: 22 },
      { header: 'التشخيص', key: 'diagnosis', width: 28 },
      { header: 'رمز الخطأ الآمن', key: 'error', width: 24 },
    ]
    const statusLabels = {
        pending: 'لم تُدقق',
        running: 'قيد التنفيذ',
        success: 'مكتملة',
        partial: 'جزئية',
        failed: 'فشلت',
      },
      diagnosisLabels: Record<GpsTripWindowCoverageAudit['diagnosis_code'], string> = {
        unbound: 'الجهاز غير مربوط',
        not_audited: 'لم تُطلب من LVN',
        import_failed: 'فشل الاستيراد',
        provider_payload_rejected: 'رفض في بيانات المصدر',
        storage_deficit: 'فقد قبل التخزين',
        render_limit: 'تجاوز حد الرسم',
        no_data: 'لا توجد نقاط',
        late_first_fix: 'بداية ناقصة',
        early_last_fix: 'نهاية ناقصة',
        internal_gaps: 'انقطاعات داخلية',
        window_incomplete: 'استيراد غير مكتمل',
        healthy: 'السلسلة مكتملة',
      }
    windowAudits.forEach((row) =>
      audit.addRow({
        window: row.window_index + 1,
        from: date(row.range_from),
        to: date(row.range_to),
        status: statusLabels[row.import_status],
        source: row.source_points ?? 0,
        valid: row.valid_points ?? 0,
        rejected: row.rejected_points ?? 0,
        stored: row.actual_stored_points,
        renderable: row.renderable_points,
        acceptance: Number(row.source_acceptance_percent),
        storage: Number(row.storage_match_percent),
        coverage: Number(row.coverage_percent),
        leading: Math.round(row.leading_gap_seconds / 60),
        trailing: Math.round(row.trailing_gap_seconds / 60),
        gaps: row.internal_gap_count,
        largest: Math.round(row.largest_gap_seconds / 60),
        diagnosis: diagnosisLabels[row.diagnosis_code],
        error: row.error_code ?? 'لا يوجد',
      }),
    )
    audit.autoFilter = { from: 'A1', to: 'R1' }
    audit.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    audit.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155E75' } }
  }
  if (trips.length) {
    const summary = workbook.addWorksheet('ملخص الآلية واليوم والشفت', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    })
    summary.columns = [
      { header: 'اليوم', key: 'day', width: 16 },
      { header: 'الآلية', key: 'vehicle', width: 24 },
      { header: 'رقم DB', key: 'db', width: 12 },
      { header: 'الشفتات', key: 'shifts', width: 22 },
      { header: 'عدد الانطلاقيات', key: 'trips', width: 18 },
      { header: 'الحركة بالدقائق', key: 'moving', width: 18 },
      { header: 'التوقف بالدقائق', key: 'stopped', width: 18 },
      { header: 'الفجوات', key: 'gaps', width: 14 },
      { header: 'متوسط التغطية', key: 'coverage', width: 18 },
      { header: 'مسارات تحتاج متابعة', key: 'issues', width: 22 },
    ]
    const metricMap = new Map(routeMetrics.map((row) => [row.departure_id, row])),
      diagnosticMap = new Map(diagnostics.map((row) => [row.departure_id, row])),
      shiftMap = new Map<string, Set<string>>(),
      groups = new Map<string, typeof trips>()
    shiftContexts.forEach((row) => {
      const labels = shiftMap.get(row.departure_id) ?? new Set<string>()
      labels.add(row.shift === 'morning' ? 'صباحي' : row.shift === 'evening' ? 'مسائي' : 'ليلي')
      shiftMap.set(row.departure_id, labels)
    })
    trips.forEach((trip) => {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(
          new Date(trip.departed_at),
        ),
        key = `${day}|${trip.vehicle_id}`
      groups.set(key, [...(groups.get(key) ?? []), trip])
    })
    groups.forEach((rows) => {
      const first = rows[0]!,
        shiftNames = new Set<string>()
      rows.forEach((row) => shiftMap.get(row.departure_id)?.forEach((name) => shiftNames.add(name)))
      summary.addRow({
        day: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(
          new Date(first.departed_at),
        ),
        vehicle: first.vehicle_name,
        db: first.db_number,
        shifts: [...shiftNames].join('، ') || 'غير محدد',
        trips: rows.length,
        moving: Math.round(
          rows.reduce(
            (sum, row) => sum + (metricMap.get(row.departure_id)?.moving_seconds ?? 0),
            0,
          ) / 60,
        ),
        stopped: Math.round(
          rows.reduce(
            (sum, row) => sum + (metricMap.get(row.departure_id)?.stopped_seconds ?? 0),
            0,
          ) / 60,
        ),
        gaps: rows.reduce((sum, row) => sum + row.gap_count, 0),
        coverage: `${Math.round(rows.reduce((sum, row) => sum + Number(row.coverage_percent), 0) / rows.length)}٪`,
        issues: rows.filter(
          (row) => diagnosticMap.get(row.departure_id)?.diagnosis_code !== 'healthy',
        ).length,
      })
    })
    summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
  }
  if (shiftContexts.length) {
    const driverSummary = workbook.addWorksheet('ملخص السائقين', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    })
    driverSummary.columns = [
      { header: 'اليوم', key: 'day', width: 16 },
      { header: 'السائق', key: 'driver', width: 24 },
      { header: 'الشفت', key: 'shift', width: 14 },
      { header: 'الآلية', key: 'vehicle', width: 24 },
      { header: 'رقم DB', key: 'db', width: 12 },
      { header: 'المناطق', key: 'areas', width: 28 },
      { header: 'عدد الانطلاقيات', key: 'trips', width: 18 },
      { header: 'مدة التداخل بالدقائق', key: 'overlap', width: 24 },
      { header: 'قاد الانطلاقية من بدايتها', key: 'primary', width: 27 },
    ]
    const tripMap = new Map(trips.map((trip) => [trip.departure_id, trip])),
      groups = new Map<
        string,
        {
          day: string
          driver: string
          shift: string
          vehicle: string
          db: string
          areas: Set<string>
          trips: Set<string>
          overlapSeconds: number
          primaryTrips: Set<string>
        }
      >()
    shiftContexts.forEach((context) => {
      const trip = tripMap.get(context.departure_id)
      if (!trip) return
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(
          new Date(context.overlap_from),
        ),
        shift =
          context.shift === 'morning' ? 'صباحي' : context.shift === 'evening' ? 'مسائي' : 'ليلي',
        key = `${day}|${context.driver_name}|${context.shift}|${trip.vehicle_id}`,
        group = groups.get(key) ?? {
          day,
          driver: context.driver_name,
          shift,
          vehicle: trip.vehicle_name,
          db: trip.db_number,
          areas: new Set<string>(),
          trips: new Set<string>(),
          overlapSeconds: 0,
          primaryTrips: new Set<string>(),
        }
      group.areas.add(context.area_name)
      group.trips.add(context.departure_id)
      group.overlapSeconds += context.overlap_seconds
      if (context.is_departure_driver) group.primaryTrips.add(context.departure_id)
      groups.set(key, group)
    })
    groups.forEach((group) =>
      driverSummary.addRow({
        day: group.day,
        driver: group.driver,
        shift: group.shift,
        vehicle: group.vehicle,
        db: group.db,
        areas: [...group.areas].join('، '),
        trips: group.trips.size,
        overlap: Math.round(group.overlapSeconds / 60),
        primary: `${group.primaryTrips.size} من ${group.trips.size}`,
      }),
    )
    driverSummary.autoFilter = { from: 'A1', to: 'I1' }
    driverSummary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    driverSummary.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4338CA' },
    }
  }
  if (tripZoneEvents.length) {
    const zones = workbook.addWorksheet('زونات الانطلاقية المحددة', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    })
    zones.columns = [
      { header: 'الحدث', key: 'event', width: 18 },
      { header: 'الزون', key: 'zone', width: 28 },
      { header: 'التوقيت', key: 'time', width: 24 },
      { header: 'خط العرض', key: 'lat', width: 16 },
      { header: 'خط الطول', key: 'lng', width: 16 },
    ]
    tripZoneEvents.forEach((event) =>
      zones.addRow({
        event: event.event_type === 'enter' ? 'دخول الزون' : 'خروج من الزون',
        zone: event.geofence_name,
        time: date(event.occurred_at),
        lat: event.latitude,
        lng: event.longitude,
      }),
    )
    zones.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    zones.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6D28D9' } }
  }
  if (investigations.length) {
    const notes = workbook.addWorksheet('تحقيقات المسار', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    })
    notes.columns = [
      { header: 'نوع الحدث', key: 'type', width: 20 },
      { header: 'وقت الحدث', key: 'eventAt', width: 24 },
      { header: 'المحقق', key: 'actor', width: 24 },
      { header: 'الملاحظة', key: 'note', width: 50 },
      { header: 'حالة المعالجة', key: 'status', width: 20 },
      { header: 'آخر تحديث', key: 'updated', width: 24 },
    ]
    const typeLabels = {
        route: 'المسار العام',
        stop: 'توقف',
        gap: 'انقطاع GPS',
        zone_enter: 'دخول زون',
        zone_exit: 'خروج من زون',
      },
      statusLabels = { open: 'مفتوح', in_review: 'قيد المراجعة', resolved: 'تمت المعالجة' }
    investigations.forEach((item) =>
      notes.addRow({
        type: typeLabels[item.event_type],
        eventAt: date(item.event_at),
        actor: item.actor_name,
        note: item.note,
        status: statusLabels[item.status],
        updated: date(item.updated_at),
      }),
    )
    notes.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    notes.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C1D95' } }
  }
  const bytes = await workbook.xlsx.writeBuffer()
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob),
    link = document.createElement('a')
  link.href = url
  link.download = `تقرير-انطلاقيات-GPS-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}

export async function exportGpsAlerts(
  alerts: GpsOperationalAlert[],
  escalations: GpsAlertEscalationHistory[] = [],
) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'منصة الأكرم — غرفة العمليات'
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
