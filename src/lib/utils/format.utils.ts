/** تنسيق أرقام وعملة ونسب — بالعربية */
const numberFmt = new Intl.NumberFormat('ar-IQ-u-nu-latn')
const currencyFmt = new Intl.NumberFormat('ar-IQ-u-nu-latn', {
  style: 'currency',
  currency: 'IQD',
  maximumFractionDigits: 0,
})

export function formatNumber(value: number): string {
  return numberFmt.format(value)
}

export function formatCurrency(value: number): string {
  return currencyFmt.format(value)
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${(value * 100).toFixed(fractionDigits)}%`
}
