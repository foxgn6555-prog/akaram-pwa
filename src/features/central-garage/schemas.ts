import { z } from 'zod'

const shift = z.enum(['morning','evening','night'])
export const garageVehicleSchema = z.object({
  vehicleName: z.string().trim().min(2,'اسم السيارة مطلوب').max(120),
  dbNumber: z.string().trim().min(1,'رقم DB مطلوب').max(50),
  plateNumber: z.string().trim().min(1,'رقم اللوحة مطلوب').max(50),
  chassisNumber: z.string().trim().min(3,'رقم الشاصي مطلوب').max(100),
  driverName: z.string().trim().min(2,'اسم السائق مطلوب').max(120),
  shift,
  sectorId: z.coerce.number().int().min(1,'اختر المنطقة').max(8,'اختر المنطقة'),
  image: z.instanceof(File,{message:'صورة الآلية مطلوبة'}),
})
export const garageVehicleEditSchema = garageVehicleSchema.omit({driverName:true,shift:true,sectorId:true,image:true}).extend({
  image: z.instanceof(File).optional(),
})
export const garageArchiveReasonSchema = z.string().trim().min(5,'السبب يجب ألا يقل عن 5 أحرف').max(500)

export const garageAssignmentSchema = z.object({
  driverName: z.string().trim().min(2,'اسم السائق مطلوب').max(120),
  shift,
  sectorId: z.coerce.number().int().min(1,'اختر المنطقة').max(8),
  reason: z.string().trim().max(300).optional(),
})

export const garageTankSchema=z.object({fuelType:z.enum(['gas_oil','hydraulic','grease','c_oil']),tankName:z.string().trim().min(2,'اسم الخزان مطلوب').max(100),capacity:z.coerce.number().positive('السعة يجب أن تكون أكبر من صفر'),initialQuantity:z.coerce.number().min(0,'الكمية لا تكون سالبة'),lowStockThreshold:z.coerce.number().min(0).max(100)}).refine(v=>v.initialQuantity<=v.capacity,{path:['initialQuantity'],message:'الكمية الابتدائية تتجاوز سعة الخزان'})
export const garageStockSchema=z.object({quantity:z.coerce.number().positive('أدخل كمية صحيحة أكبر من صفر'),notes:z.string().trim().max(300).optional()})
export const garageFillSchema=z.object({vehicleId:z.string().uuid('اختر آلية من نتائج البحث'),quantity:z.coerce.number().positive('أدخل كمية صحيحة أكبر من صفر'),nextRefillDate:z.string().min(1,'تاريخ الموعد التالي مطلوب'),notes:z.string().trim().max(300).optional()})
export const garageZeroSchema=z.object({reason:z.string().trim().min(5,'سبب التصفير يجب ألا يقل عن 5 أحرف').max(500)})
