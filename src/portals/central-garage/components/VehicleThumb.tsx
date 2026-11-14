import { useState } from 'react'
import { CarFront } from 'lucide-react'

/**
 * 00410: صورة الآلية مع بديل واضح بدل صورة مكسورة.
 * الحالات الثلاث التي كانت تُنتج صورة مكسورة: (١) لا يوجد `imageUrl` لأن رابط التوقيع فشل أو الكائن محذوف،
 * (٢) المسار يبدأ بـ`import/` وهي صور الاستيراد غير المنشورة في التخزين،
 * (٣) الرابط الموقّع انتهى (٦٠٠ ثانية) والبيانات ما زالت في ذاكرة الاستعلام.
 */
export function VehicleThumb({
  imageUrl,
  imagePath = '',
  name,
  className,
  iconSize = 26,
  showLabel = true,
  testId = 'vehicle-thumb',
}: {
  imageUrl?: string
  imagePath?: string
  name: string
  className: string
  iconSize?: number
  showLabel?: boolean
  testId?: string
}) {
  const [failed, setFailed] = useState(false)
  const usable = Boolean(imageUrl) && !imagePath.startsWith('import/') && !failed
  if (usable) {
    return (
      <img
        src={imageUrl}
        alt={`صورة ${name}`}
        data-testid={`${testId}-img`}
        className={className}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div
      data-testid={`${testId}-placeholder`}
      role="img"
      aria-label={`بلا صورة — ${name}`}
      className={`flex flex-col items-center justify-center gap-1 overflow-hidden bg-slate-100 text-slate-500 ${className}`}
    >
      <CarFront size={iconSize} aria-hidden />
      {showLabel && <span className="text-[10px] font-bold leading-none">بلا صورة</span>}
    </div>
  )
}
