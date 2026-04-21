const debug = require('debug')

const MAX_DEPTH = 12
const MAX_STRING_LEN = 2000
const DEBUG_FIELD_PREVIEW = 800
const ARRAY_MAX_ITEMS = 40

/**
 * Optional correlation id: query ?sessionId=, JSON body.sessionId,
 * or headers x-session-id / x-botium-session-id
 */
const getSessionId = (req) => {
  if (!req) return undefined
  const q = req.query || {}
  const h = req.headers || {}
  const fromQuery = q.sessionId || q.SessionId
  if (fromQuery) return String(fromQuery)
  const fromHeader = h['x-session-id'] || h['x-botium-session-id']
  if (fromHeader) return String(fromHeader)
  const body = req.body
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
    if (body.sessionId != null) return String(body.sessionId)
    if (body.SessionId != null) return String(body.SessionId)
  }
  return undefined
}

const shouldRedactKey = (k) => {
  const lower = String(k).toLowerCase()
  return lower.includes('password') ||
    lower.includes('secret') ||
    lower === 'authorization' ||
    lower.includes('apikey') ||
    lower.includes('api_key') ||
    lower === 'token' ||
    lower.includes('subscriptionkey') ||
    lower.includes('private_key') ||
    lower === 'botium_api_token' ||
    lower === 'credentials'
}

const isStreamHandle = (v) => {
  return v && typeof v === 'object' &&
    typeof v.write === 'function' &&
    v.events &&
    typeof v.events.on === 'function' &&
    typeof v.events.emit === 'function'
}

const summarizeDebugField = (v) => {
  if (v == null) return v
  if (Buffer.isBuffer(v)) return `[Binary ${v.length} bytes]`
  if (typeof v === 'string') {
    return v.length > DEBUG_FIELD_PREVIEW ? `${v.slice(0, DEBUG_FIELD_PREVIEW)}…[truncated]` : v
  }
  try {
    const s = JSON.stringify(v)
    if (s.length <= DEBUG_FIELD_PREVIEW * 2) return JSON.parse(s)
    return {
      _preview: `${s.slice(0, DEBUG_FIELD_PREVIEW)}…`,
      _approxLen: s.length
    }
  } catch (e) {
    return '[Unserializable]'
  }
}

const summarizeForLog = (value, depth = 0) => {
  if (value === null || value === undefined) return value
  if (depth > MAX_DEPTH) return '[MaxDepth]'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LEN
      ? `${value.slice(0, MAX_STRING_LEN)}…[truncated ${value.length - MAX_STRING_LEN} chars]`
      : value
  }
  if (typeof value === 'function') return '[Function]'
  if (Buffer.isBuffer(value)) return `[Binary ${value.length} bytes]`
  if (value instanceof Uint8Array) return `[Binary ${value.byteLength} bytes]`
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return `[Binary ${value.byteLength} bytes]`
  }

  if (Array.isArray(value)) {
    const slice = value.slice(0, ARRAY_MAX_ITEMS).map((x) => summarizeForLog(x, depth + 1))
    if (value.length > ARRAY_MAX_ITEMS) {
      slice.push(`…[+${value.length - ARRAY_MAX_ITEMS} items]`)
    }
    return slice
  }

  if (typeof value === 'object') {
    if (value instanceof Date) return value.toISOString()
    if (isStreamHandle(value)) {
      return {
        streamHandle: true,
        keys: Object.keys(value).filter((k) => typeof value[k] !== 'function')
      }
    }
    if (typeof value.emit === 'function' && typeof value.on === 'function') {
      return '[EventEmitter]'
    }

    const out = {}
    for (const k of Object.keys(value)) {
      if (shouldRedactKey(k)) {
        out[k] = '[redacted]'
        continue
      }
      if (depth === 0 && k === 'debug') {
        out[k] = summarizeDebugField(value[k])
        continue
      }
      out[k] = summarizeForLog(value[k], depth + 1)
    }
    return out
  }
  return String(value)
}

const logLine = (namespace, phase, req, provider, method, data = {}) => {
  const dbg = debug(namespace)
  const line = {
    phase,
    provider,
    method,
    sessionId: getSessionId(req) || undefined,
    ...data
  }
  dbg(JSON.stringify(line))
}

/**
 * Logs start (params), end (result), or error; rethrows on failure.
 */
const withApiCallLog = async (namespace, req, provider, method, params, fn) => {
  logLine(namespace, 'start', req, provider, method, { params: summarizeForLog(params) })
  try {
    const result = await fn()
    logLine(namespace, 'end', req, provider, method, { result: summarizeForLog(result) })
    return result
  } catch (err) {
    logLine(namespace, 'error', req, provider, method, { error: err.message || String(err) })
    throw err
  }
}

module.exports = {
  getSessionId,
  summarizeForLog,
  logLine,
  withApiCallLog
}
