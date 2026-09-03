import { buildGatewayUrl } from './url'

export interface ImageStudioEnumCapability {
  values: string[]
  default: string
}

export interface ImageStudioIntegerCapability {
  min: number
  max: number
  default: number
}

export interface ImageStudioModelCapability {
  id: string
  operations: string[]
  parameters: {
    size?: ImageStudioEnumCapability
    quality?: ImageStudioEnumCapability
    background?: ImageStudioEnumCapability
    output_format?: ImageStudioEnumCapability
    n?: ImageStudioIntegerCapability
  }
}

export interface ImageStudioCapabilities {
  operations: string[]
  models: ImageStudioModelCapability[]
  uploads: {
    mime_types: string[]
    max_files: number
    max_file_bytes: number
    max_total_bytes: number
  }
}

function isEnumCapability(value: unknown): value is ImageStudioEnumCapability {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ImageStudioEnumCapability>
  return Array.isArray(candidate.values)
    && candidate.values.length > 0
    && candidate.values.every((item) => typeof item === 'string')
    && typeof candidate.default === 'string'
    && candidate.values.includes(candidate.default)
}

function normalizeCapabilities(value: unknown): ImageStudioCapabilities {
  if (!value || typeof value !== 'object') throw new Error('Invalid image capability response')
  const candidate = value as Partial<ImageStudioCapabilities>
  if (!Array.isArray(candidate.operations) || !Array.isArray(candidate.models)) {
    throw new Error('Invalid image capability response')
  }

  const models = candidate.models.flatMap((model) => {
    if (!model || typeof model.id !== 'string' || !Array.isArray(model.operations)) return []
    const raw = model.parameters || {}
    const parameters: ImageStudioModelCapability['parameters'] = {}
    if (isEnumCapability(raw.size)) parameters.size = raw.size
    if (isEnumCapability(raw.quality)) parameters.quality = raw.quality
    if (isEnumCapability(raw.background)) parameters.background = raw.background
    if (isEnumCapability(raw.output_format)) parameters.output_format = raw.output_format
    if (raw.n && Number.isInteger(raw.n.min) && Number.isInteger(raw.n.max)
      && Number.isInteger(raw.n.default) && raw.n.min <= raw.n.default && raw.n.default <= raw.n.max) {
      parameters.n = raw.n
    }
    return [{ id: model.id, operations: model.operations, parameters }]
  })

  return {
    operations: candidate.operations.filter((operation): operation is string => typeof operation === 'string'),
    models,
    uploads: candidate.uploads || {
      mime_types: [], max_files: 0, max_file_bytes: 0, max_total_bytes: 0,
    },
  }
}

export async function getImageStudioCapabilities(apiKey: string): Promise<ImageStudioCapabilities> {
  const response = await fetch(buildGatewayUrl('/v1/images/capabilities'), {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) throw new Error('Image capabilities unavailable')
  return normalizeCapabilities(await response.json())
}

export interface ImageStudioGenerationResult {
  src: string
}

export interface ImageStudioGenerationResponse {
  images: ImageStudioGenerationResult[]
  failedCount: number
}

export type ImageStudioFailureKind =
  | 'rateLimited'
  | 'insufficientBalance'
  | 'moderationRejected'
  | 'invalidKey'
  | 'unknown'

export interface ImageStudioFailure {
  kind: ImageStudioFailureKind
  requestId?: string
  retryAfterSeconds?: number
}

export class ImageStudioRequestError extends Error implements ImageStudioFailure {
  readonly kind: ImageStudioFailureKind
  readonly requestId?: string
  readonly retryAfterSeconds?: number

  constructor(kind: ImageStudioFailureKind, requestId?: string, retryAfterSeconds?: number) {
    super('Image Studio request failed')
    this.name = 'ImageStudioRequestError'
    this.kind = kind
    this.requestId = requestId
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function safeRequestId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  const requestLike = /^(?:req(?:uest)?|rid)[._:-][A-Za-z0-9._:-]{1,119}$/i
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return requestLike.test(trimmed) || uuid.test(trimmed) ? trimmed : undefined
}

function retryAfterSeconds(value: string | null): number {
  if (value) {
    const seconds = Number(value)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, Math.ceil(seconds))
    const date = Date.parse(value)
    if (Number.isFinite(date)) return Math.max(1, Math.ceil((date - Date.now()) / 1000))
  }
  return 60
}

function responseErrorSignals(body: unknown) {
  if (!body || typeof body !== 'object') return { code: '', type: '', message: '' }
  const value = body as {
    code?: unknown
    message?: unknown
    error?: { code?: unknown; type?: unknown; message?: unknown } | unknown
  }
  const error = value.error && typeof value.error === 'object'
    ? value.error as { code?: unknown; type?: unknown; message?: unknown }
    : undefined
  const lower = (candidate: unknown) => typeof candidate === 'string' ? candidate.toLowerCase() : ''
  return {
    code: lower(error?.code ?? value.code),
    type: lower(error?.type),
    message: lower(error?.message ?? value.message ?? value.error),
  }
}

async function requestError(response: Response): Promise<ImageStudioRequestError> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  const signal = responseErrorSignals(body)
  const bodyRequestId = body && typeof body === 'object'
    ? safeRequestId((body as { request_id?: unknown }).request_id)
    : undefined
  const requestId = safeRequestId(response.headers.get('x-request-id')) ?? bodyRequestId

  if (response.status === 429 || signal.type.includes('rate_limit') || ['rate_limit_exceeded', 'rate_limited'].includes(signal.code)) {
    return new ImageStudioRequestError('rateLimited', requestId, retryAfterSeconds(response.headers.get('retry-after')))
  }
  if (response.status === 402 || signal.type === 'billing_error'
    || ['insufficient_balance', 'insufficient_quota'].includes(signal.code)
    || signal.message.includes('insufficient balance')) {
    return new ImageStudioRequestError('insufficientBalance', requestId)
  }
  const moderationSignals = ['content_policy_violation', 'moderation_blocked', 'moderation_rejected']
  if (moderationSignals.includes(signal.code) || moderationSignals.includes(signal.type)
    || signal.code.includes('safety_violation') || signal.type.includes('safety_violation')) {
    return new ImageStudioRequestError('moderationRejected', requestId)
  }
  if (response.status === 401 || ['invalid_api_key', 'api_key_expired', 'key_expired', 'key_revoked', 'api_key_revoked'].includes(signal.code)
    || signal.type === 'api_key_expired'
    || signal.message.includes('api key has been revoked')) {
    return new ImageStudioRequestError('invalidKey', requestId)
  }
  return new ImageStudioRequestError('unknown', requestId)
}

async function normalizeImageResponse(
  response: Response,
  outputFormat: string,
): Promise<ImageStudioGenerationResponse> {
  if (!response.ok) throw await requestError(response)

  const requestId = safeRequestId(response.headers.get('x-request-id'))
  let body: { data?: Array<{ b64_json?: unknown; url?: unknown }> }
  try {
    body = await response.json() as typeof body
  } catch {
    throw new ImageStudioRequestError('unknown', requestId)
  }
  if (!Array.isArray(body.data)) {
    throw new ImageStudioRequestError('unknown', requestId)
  }
  const mime = outputFormat === 'jpg' || outputFormat === 'jpeg' ? 'image/jpeg' : `image/${outputFormat || 'png'}`
  const images: ImageStudioGenerationResult[] = []
  let failedCount = 0
  for (const item of body.data) {
    if (typeof item.b64_json === 'string' && item.b64_json.length > 0) {
      images.push({ src: `data:${mime};base64,${item.b64_json}` })
    } else if (typeof item.url === 'string' && /^https?:\/\//i.test(item.url)) {
      images.push({ src: item.url })
    } else {
      failedCount += 1
    }
  }
  return { images, failedCount }
}

export async function generateImageStudioImages(
  apiKey: string,
  payload: Record<string, string | number>,
  outputFormat: string,
): Promise<ImageStudioGenerationResponse> {
  const response = await fetch(buildGatewayUrl('/v1/images/generations'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  return normalizeImageResponse(response, outputFormat)
}

export async function editImageStudioImages(
  apiKey: string,
  files: File[],
  payload: Record<string, string | number>,
  outputFormat: string,
): Promise<ImageStudioGenerationResponse> {
  const body = new FormData()
  for (const file of files) body.append('image', file)
  for (const [name, value] of Object.entries(payload)) body.append(name, String(value))

  const response = await fetch(buildGatewayUrl('/v1/images/edits'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  })
  return normalizeImageResponse(response, outputFormat)
}
