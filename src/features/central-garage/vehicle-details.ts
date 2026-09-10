export const GARAGE_VEHICLE_CATEGORIES=['compactor_small','compactor_large','truck','shovel','tipper','tanker','sweeper','strat','other'] as const
export type GarageVehicleCategory=typeof GARAGE_VEHICLE_CATEGORIES[number]
export const GARAGE_VEHICLE_CATEGORY_LABELS:Record<GarageVehicleCategory,string>={compactor_small:'كابسة صغيرة',compactor_large:'كابسة كبيرة',truck:'كميون',shovel:'شفل',tipper:'قلاب',tanker:'تنكر',sweeper:'كناسة',strat:'استرات',other:'أخرى'}
export const GARAGE_OWNERSHIP_TYPES=['owned','rented'] as const
export type GarageOwnershipType=typeof GARAGE_OWNERSHIP_TYPES[number]
export const GARAGE_OWNERSHIP_LABELS:Record<GarageOwnershipType,string>={owned:'آلية ذاتية',rented:'آلية مؤجرة'}
