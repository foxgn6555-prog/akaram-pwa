/** i18n — العربية الافتراضية والوحيدة الآن؛ بنية جاهزة لإضافة en لاحقاً */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import common from './ar/common.json'
import auth from './ar/auth.json'
import employee from './ar/employee.json'
import hr from './ar/hr.json'
import requests from './ar/requests.json'
import finance from './ar/finance.json'
import it from './ar/it.json'
import errors from './ar/errors.json'
import sidebar from './ar/sidebar.json'

const resources = {
  ar: { common, auth, employee, hr, requests, finance, it, errors, sidebar },
} as const

void i18n.use(initReactI18next).init({
  resources,
  lng: 'ar',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n
