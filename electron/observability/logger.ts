import fs from 'node:fs'
import path from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  event: string
  [field: string]: unknown
}

const PLAIN_SECRET_PATTERNS: RegExp[] = [
  /(sk-[A-Za-z0-9_-]{8,})/g,
  /(AIza[A-Za-z0-9_-]{8,})/g,
  /(gh[pousr]_[A-Za-z0-9]{8,})/g,
  /(bearer\s+[A-Za-z0-9._-]{8,})/gi,
]

const NAMED_SECRET_PATTERN = /(["']?(?:api[_-]?key|token|secret|password)["']?\s*[:=]\s*["']?)([^"'\s,}]{4,})/gi

export function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    let result = value
    for (const pattern of PLAIN_SECRET_PATTERNS) result = result.replace(pattern, '***REDACTED***')
    return result.replace(NAMED_SECRET_PATTERN, (_match, prefix: string) => `${prefix}***REDACTED***`)
  }
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      output[key] = /key|token|secret|password|auth/i.test(key) ? '***REDACTED***' : redact(item)
    }
    return output
  }
  return value
}

export class StructuredLogger {
  constructor(private readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
  }

  write(level: LogLevel, event: string, fields: Record<string, unknown> = {}): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...(redact(fields) as Record<string, unknown>),
    }
    try {
      fs.appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, 'utf-8')
    } catch {
      return entry
    }
    return entry
  }

  debug(event: string, fields?: Record<string, unknown>): void {
    this.write('debug', event, fields)
  }

  info(event: string, fields?: Record<string, unknown>): void {
    this.write('info', event, fields)
  }

  warn(event: string, fields?: Record<string, unknown>): void {
    this.write('warn', event, fields)
  }

  error(event: string, fields?: Record<string, unknown>): void {
    this.write('error', event, fields)
  }
}
