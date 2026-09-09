export const GARAGE_FUEL_UNITS = ['liter','kilogram','gallon','barrel','container','piece'] as const
export type GarageFuelUnit = typeof GARAGE_FUEL_UNITS[number]
export const garageFuelUnitLabels:Record<GarageFuelUnit,string>={liter:'لتر',kilogram:'كيلوغرام',gallon:'غالون',barrel:'برميل',container:'عبوة',piece:'قطعة'}
export function garageUnitLabel(unit:string|undefined|null):string{return unit&&unit in garageFuelUnitLabels?garageFuelUnitLabels[unit as GarageFuelUnit]:(unit||'غير محددة')}
