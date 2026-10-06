import { CarFront, MapPin, Moon, Sun, Sunrise, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import type { GarageVehicle } from '@features/central-garage/types'
import {
  GARAGE_OWNERSHIP_LABELS,
  GARAGE_VEHICLE_CATEGORY_LABELS,
} from '@features/central-garage/vehicle-details'

const shiftMeta = {
  morning: { label: 'صباحي', icon: Sunrise, color: 'bg-amber-50 text-amber-800' },
  evening: { label: 'مسائي', icon: Sun, color: 'bg-orange-50 text-orange-800' },
  night: { label: 'ليلي', icon: Moon, color: 'bg-indigo-50 text-indigo-800' },
}

export function VehicleCard({
  vehicle,
  action,
  basePath = '/central-garage/vehicles-database',
}: {
  vehicle: GarageVehicle
  action?: React.ReactNode
  basePath?: string
}) {
  const shift = shiftMeta[vehicle.shift]
  const ShiftIcon = shift.icon
  return (
    <article
      className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-xl"
      data-testid={`vehicle-card-${vehicle.id}`}
    >
      <Link to={`${basePath}/${vehicle.id}`} className="block">
        <div className="relative h-40 overflow-hidden bg-slate-100">
          {vehicle.imageUrl && !vehicle.imagePath.startsWith('import/') ? (
            <img
              src={vehicle.imageUrl}
              alt={`صورة ${vehicle.vehicleName}`}
              className="size-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 bg-gradient-to-b from-slate-100 to-slate-200 text-slate-500" data-testid={`vehicle-no-photo-${vehicle.id}`}>
              <CarFront size={34} />
              <span className="text-[11px] font-bold">بلا صورة — أضفها من صفحة الآلية</span>
            </div>
          )}
          <span className="absolute end-3 top-3 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-black text-white backdrop-blur">
            DB {vehicle.dbNumber}
          </span>
        </div>
        <div className="p-4">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-800">
              {GARAGE_VEHICLE_CATEGORY_LABELS[vehicle.vehicleCategory]}
            </span>
            <span
              className={`rounded-full px-2 py-1 text-[10px] font-black ${vehicle.ownershipType === 'rented' ? 'bg-violet-50 text-violet-800' : 'bg-emerald-50 text-emerald-800'}`}
            >
              {GARAGE_OWNERSHIP_LABELS[vehicle.ownershipType]}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-black text-slate-900">{vehicle.vehicleName}</h2>
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${shift.color}`}
            >
              <ShiftIcon size={13} />
              {shift.label}
            </span>
          </div>
          <div className="mt-3 space-y-2 text-xs text-slate-600">
            <p className="flex items-center gap-2">
              <UserRound size={14} className="text-cyan-700" />
              <span className="font-bold">{vehicle.driverName}</span>
              {vehicle.driverEmployeeNumber && (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-600" data-testid={`driver-emp-${vehicle.id}`}>
                  {vehicle.driverEmployeeNumber}
                </span>
              )}
              {vehicle.driverEmployeeId === null && (
                <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-700" data-testid={`driver-unlinked-${vehicle.id}`} title="اسم قديم غير مرتبط بموظف — تصحيحه من غرفة العمليات">
                  غير مرتبط بموظف
                </span>
              )}
              {vehicle.driverHasBiometric === false && vehicle.driverEmployeeId && (
                <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-black text-rose-700" title="السائق بلا بصمة مسجلة في HR">
                  بلا بصمة
                </span>
              )}
            </p>
            <p className="flex items-center gap-2">
              <MapPin size={14} className="text-cyan-700" />
              {vehicle.parentSector === 'karrada' ? 'قاطع الكرادة' : 'قاطع الزعفرانية'} ·{' '}
              {vehicle.areaName}
            </p>
          </div>
        </div>
      </Link>
      {action && <div className="border-t border-slate-100 p-3">{action}</div>}
    </article>
  )
}
