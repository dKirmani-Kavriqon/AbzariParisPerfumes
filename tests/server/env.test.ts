import { describe, expect, it } from 'vitest'
import { getServerEnv, requireServerEnv } from '../../src/server/env'
import { ConfigError } from '../../src/server/http/errors'

const DB = 'postgresql://user:pw@ep-x.example.neon.tech/neondb?sslmode=require'

describe('server environment', () => {
  it('applies defaults when optional values are absent', () => {
    expect(getServerEnv({})).toEqual({ APP_ENV: 'development', LOG_LEVEL: 'info' })
  })

  it('treats blank values as unset', () => {
    expect(getServerEnv({ DATABASE_URL: '  ', APP_ENV: '' }).DATABASE_URL).toBeUndefined()
  })

  it('accepts a valid configuration', () => {
    const env = getServerEnv({ APP_ENV: 'preview', DATABASE_URL: DB, HEALTH_CHECK_TOKEN: 'x'.repeat(32) })
    expect(env.APP_ENV).toBe('preview')
    expect(env.DATABASE_URL).toBe(DB)
  })

  it('names invalid variables without echoing their values', () => {
    const secret = 'mysql://root:hunter2@db'
    try {
      getServerEnv({ DATABASE_URL: secret, HEALTH_CHECK_TOKEN: 'short', APP_ENV: 'staging' })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError)
      const problems = (e as ConfigError).problems.join('\n')
      expect(problems).toMatch(/DATABASE_URL/)
      expect(problems).toMatch(/HEALTH_CHECK_TOKEN/)
      expect(problems).toMatch(/APP_ENV/)
      expect(problems).not.toContain('hunter2')
      expect(problems).not.toContain('short')
    }
  })

  it('requireServerEnv throws a ConfigError when a needed variable is missing', () => {
    expect(() => requireServerEnv('DATABASE_URL', {})).toThrow(ConfigError)
    expect(requireServerEnv('DATABASE_URL', { DATABASE_URL: DB })).toBe(DB)
  })
})
