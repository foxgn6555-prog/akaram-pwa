import { z } from 'zod'
import { GARAGE_FUEL_UNITS } from './fuel-units'
import { GARAGE_OWNERSHIP_TYPES, GARAGE_VEHICLE_CATEGORIES } from './vehicle-details'

const shift = z.enum(['morning','evening','night'])
const garageVehicleBase = z.object({
  vehicleName: z.string().trim().min(2,'اسم السيارة مطلوب').max(120),
  dbNumber: z.string().trim().min(1,'رقم DB مطلوب').max(50),
  plateNumber: z.string().trim().min(1,'رقم اللوحة مطلوب').max(50),
  chassisNumber: z.string().trim().min(3,'رقم الشاصي مطلوب').max(100),
  vehicleCategory: z.enum(GARAGE_VEHICLE_CATEGORIES,{message:'اختر نوع الآلية'}), ownershipType: z.enum(GARAGE_OWNERSHIP_TYPES,{message:'اختر ملكية الآلية'}),
  lessorName:z.string().trim().max(160).optional().or(z.literal('')),rentalContractNo:z.string().trim().max(80).optional().or(z.literal('')),rentalStartDate:z.string().date().optional().or(z.literal('')),rentalEndDate:z.string().date().optional().or(z.literal('')),
  modelYear:z.preprocess(v=>v===''?undefined:v,z.coerce.number().int().min(1950).max(new Date().getFullYear()+1).optional()),vehicleColor:z.string().trim().max(50).optional().or(z.literal('')),specifications:z.string().trim().max(1000).optional().or(z.literal('')),
  driverName:z.string().trim().min(2,'اسم السائق مطلوب').max(120),shift,sectorId:z.coerce.number().int().min(1,'اختر المنطقة').max(8,'اختر المنطقة'),image:z.instanceof(File,{message:'صورة الآلية مطلوبة'}),
})
const rentalRules=(v:{ownershipType:'owned'|'rented';lessorName?:string;rentalStartDate?:string;rentalEndDate?:string},ctx:z.RefinementCtx)=>{if(v.ownershipType==='rented'&&(!v.lessorName||v.lessorName.length<2))ctx.addIssue({code:'custom',path:['lessorName'],message:'اسم الجهة المؤجرة مطلوب'});if(v.rentalEndDate&&(!v.rentalStartDate||v.rentalEndDate<v.rentalStartDate))ctx.addIssue({code:'custom',path:['rentalEndDate'],message:'تاريخ نهاية الإيجار يجب ألا يسبق البداية'})}
export const garageVehicleSchema=garageVehicleBase.superRefine(rentalRules)
export const garageVehicleEditSchema=garageVehicleBase.omit({driverName:true,shift:true,sectorId:true,image:true}).extend({image:z.instanceof(File).optional()}).superRefine(rentalRules)
export const garageArchiveReasonSchema = z.string().trim().min(5,'السبب يجب ألا يقل عن 5 أحرف').max(500)

export const garageAssignmentSchema = z.object({
  driverName: z.string().trim().min(2,'اسم السائق مطلوب').max(120),
  shift,
  sectorId: z.coerce.number().int().min(1,'اختر المنطقة').max(8),
  reason: z.string().trim().max(300).optional(),
})

export const garageTankSchema=z.object({fuelType:z.enum(['gas_oil','hydraulic','grease','c_oil']),tankName:z.string().trim().min(2,'اسم الخزان مطلوب').max(100),unit:z.enum(GARAGE_FUEL_UNITS).default('liter'),capacity:z.coerce.number().positive('السعة يجب أن تكون أكبر من صفر'),initialQuantity:z.coerce.number().min(0,'الكمية لا تكون سالبة'),lowStockThreshold:z.coerce.number().min(0).max(100)}).refine(v=>v.initialQuantity<=v.capacity,{path:['initialQuantity'],message:'الكمية الابتدائية تتجاوز سعة الخزان'})
export const garageStockSchema=z.object({quantity:z.coerce.number().positive('أدخل كمية صحيحة أكبر من صفر'),notes:z.string().trim().max(300).optional()})
export const garageFillSchema=z.object({vehicleId:z.string().uuid('اختر آلية من نتائج البحث'),quantity:z.coerce.number().positive('أدخل كمية صحيحة أكبر من صفر'),nextRefillDate:z.preprocess(value=>value===''?undefined:value,z.string().date('تاريخ موعد التعبئة غير صالح').optional()),notes:z.string().trim().max(300).optional()})
export const garageZeroSchema=z.object({reason:z.string().trim().min(5,'سبب التصفير يجب ألا يقل عن 5 أحرف').max(500)})
