import { describe, expect, it } from 'vitest'
import { createLogger, redact } from '../../src/server/log'

describe('log redaction', () => {
  it('hides values under sensitive keys, at any depth', () => {
    const out = redact({ ok: 1, password: 'p', nested: { apiKey: 'k', Authorization: 'Bearer x', customerEmail: 'a@b.c', phone: '1' } })
    expect(out).toEqual({ ok: 1, password: '[redacted]', nested: { apiKey: '[redacted]', Authorization: '[redacted]', customerEmail: '[redacted]', phone: '[redacted]' } })
  })

  it('masks connection strings and keys inside free text', () => {
    const msg = String(redact('failed to reach postgresql://u:pw@host/db with Bearer abc.def and rzp_test_ABCDEF123456'))
    expect(msg).not.toMatch(/pw@host|abc\.def|rzp_test_ABCDEF/)
    expect(msg.match(/\[redacted\]/g)).toHaveLength(3)
  })

  it('writes one JSON line per entry and respects the minimum level', () => {
    const lines: string[] = []
    const log = createLogger({ requestId: 'r1' }, 'info', (l) => lines.push(l))
    log.debug('hidden')
    log.info('shown', { status: 200, token: 't' })
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({ level: 'info', msg: 'shown', requestId: 'r1', status: 200, token: '[redacted]' })
  })
})
