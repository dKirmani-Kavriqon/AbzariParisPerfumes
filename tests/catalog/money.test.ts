import { describe, expect, it } from 'vitest'
import { formatMoney, isValidCurrency, minorUnitDigits, parseMoney, toDecimalString } from '../../src/commerce/catalog/money'
import { slugify } from '../../src/commerce/catalog/slug'

describe('money (integer minor units, no floating point)', () => {
  it('parses amounts into minor units exactly', () => {
    expect(parseMoney('1499.50', 'INR')).toBe(149950)
    expect(parseMoney('1,499.5', 'INR')).toBe(149950)
    expect(parseMoney('0.10', 'INR')).toBe(10)
    expect(parseMoney('19.99', 'USD')).toBe(1999) // 19.99 * 100 is 1998.9999… in floating point
    expect(parseMoney('1500', 'JPY')).toBe(1500)
    expect(parseMoney('1.234', 'KWD')).toBe(1234)
  })

  it('rejects malformed, negative or over-precise amounts', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1e3', '12.3.4']) expect(parseMoney(bad, 'INR')).toBeNull()
    expect(parseMoney('1.5', 'JPY')).toBeNull()
    expect(parseMoney('99999999999', 'INR')).toBeNull()
  })

  it('round-trips minor units to form values and display strings', () => {
    expect(toDecimalString(149950, 'INR')).toBe('1499.50')
    expect(toDecimalString(5, 'INR')).toBe('0.05')
    expect(toDecimalString(1500, 'JPY')).toBe('1500')
    expect(formatMoney(150000, 'INR')).toBe('₹1,500')
  })

  it('knows each currency’s minor unit and rejects unknown codes', () => {
    expect(minorUnitDigits('INR')).toBe(2)
    expect(minorUnitDigits('JPY')).toBe(0)
    expect(isValidCurrency('INR')).toBe(true)
    expect(isValidCurrency('usd')).toBe(false)
    expect(isValidCurrency('ZZZ')).toBe(false)
  })
})

describe('slugify', () => {
  it('builds clean slugs from names', () => {
    expect(slugify('Élan Noir (50 ml)')).toBe('elan-noir-50-ml')
    expect(slugify('  Oud & Amber  ')).toBe('oud-and-amber')
    expect(slugify('***')).toBe('')
  })
})
