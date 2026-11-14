import 'server-only'

/**
 * Structured logging for Workers. Each call writes one JSON line, which Cloudflare's
 * Workers Logs (free plan included) indexes by field.
 *
 * Safe by default: values under keys that look like credentials or personal data are
 * replaced with "[redacted]", and strings that look like connection strings or bearer
 * tokens are masked wherever they appear. Log ids and outcomes, not request bodies.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>

const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const SENSITIVE_KEY =
  /pass(word)?|secret|token|api[-_]?key|authori[sz]ation|cookie|session|database_url|connection|signature|card|cvv|otp|email|phone|address/i
const SENSITIVE_VALUE = [
  /postgres(ql)?:\/\/[^\s"']+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(rzp_(live|test)_[A-Za-z0-9]+|re_[A-Za-z0-9_]{10,}|napi_[A-Za-z0-9]+)\b/g,
]

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]'
  if (typeof value === 'string') return SENSITIVE_VALUE.reduce((s, re) => s.replace(re, '[redacted]'), value)
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1)
    return out
  }
  return value
}

export type Logger = {
  debug: (msg: string, fields?: LogFields) => void
  info: (msg: string, fields?: LogFields) => void
  warn: (msg: string, fields?: LogFields) => void
  error: (msg: string, fields?: LogFields) => void
  child: (fields: LogFields) => Logger
}

export function createLogger(base: LogFields = {}, minLevel: LogLevel = 'info', sink: (line: string) => void = defaultSink): Logger {
  const write = (level: LogLevel, msg: string, fields?: LogFields) => {
    if (order[level] < order[minLevel]) return
    const entry = { level, msg, time: new Date().toISOString(), ...(redact({ ...base, ...fields }) as LogFields) }
    sink(JSON.stringify(entry))
  }
  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
    child: (fields) => createLogger({ ...base, ...fields }, minLevel, sink),
  }
}

function defaultSink(line: string) {
  console.log(line)
}
