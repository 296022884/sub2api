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

async function normalizeImageResponse(
  response: Response,
  outputFormat: string,
  operation: 'generation' | 'editing',
): Promise<ImageStudioGenerationResponse> {
  if (!response.ok) throw new Error(`Image ${operation} failed`)

  const body = await response.json() as { data?: Array<{ b64_json?: unknown; url?: unknown }> }
  if (!Array.isArray(body.data)) throw new Error(`Invalid image ${operation} response`)
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
  return normalizeImageResponse(response, outputFormat, 'generation')
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
  return normalizeImageResponse(response, outputFormat, 'editing')
}
