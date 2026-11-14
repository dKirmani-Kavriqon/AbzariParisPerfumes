import { describe, expect, it } from 'vitest'
import { store } from '../../src/config/store'

describe('store configuration', () => {
  it('has a lowercase machine id', () => {
    expect(store.id).toMatch(/^[a-z0-9-]+$/)
  })

  it('uses an E.164 phone number for tel: links', () => {
    expect(store.contact.phoneE164).toMatch(/^\+[1-9]\d{6,14}$/)
  })

  it('contains nothing that looks like a secret (it is bundled into browser code)', () => {
    const text = JSON.stringify(store)
    expect(text).not.toMatch(/postgres(ql)?:\/\/|rzp_(live|test)_|re_[A-Za-z0-9]{10,}|napi_|secret|password|token/i)
  })
})
