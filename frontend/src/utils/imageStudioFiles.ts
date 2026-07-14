import { zipSync } from 'fflate'
import type { ImageStudioGenerationResult } from '@/api/imageStudio'

export interface ImageUploadLimits {
  mime_types: string[]
  max_files: number
  max_file_bytes: number
  max_total_bytes: number
}

export type ImageUploadError = 'mime' | 'count' | 'fileSize' | 'totalSize'

export function validateImageUploads(files: File[], limits: ImageUploadLimits): ImageUploadError | null {
  if (files.some((file) => !limits.mime_types.includes(file.type))) return 'mime'
  if (files.length > limits.max_files) return 'count'
  if (files.some((file) => file.size > limits.max_file_bytes)) return 'fileSize'
  if (files.reduce((total, file) => total + file.size, 0) > limits.max_total_bytes) return 'totalSize'
  return null
}

export async function imageResultToBlob(result: ImageStudioGenerationResult): Promise<Blob> {
  if (result.src.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,(.+)$/i.exec(result.src)
    if (!match) throw new Error('Invalid generated image')
    const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0))
    return new Blob([bytes], { type: match[1] })
  }
  const response = await fetch(result.src)
  if (!response.ok) throw new Error('Generated image unavailable')
  return response.blob()
}

export async function imageResultToFile(result: ImageStudioGenerationResult, filenameBase: string): Promise<File> {
  const blob = await imageResultToBlob(result)
  return new File([blob], `${filenameBase}.${imageExtension(blob)}`, { type: blob.type || 'image/png' })
}

export function safeImageFilename(blob: Blob, prefix: string, index: number): string {
  return `${safeFilenamePart(prefix)}-${index + 1}.${imageExtension(blob)}`
}

export async function downloadImageResult(
  result: ImageStudioGenerationResult,
  prefix: string,
  index: number,
): Promise<void> {
  const blob = await imageResultToBlob(result)
  saveBlob(blob, safeImageFilename(blob, prefix, index))
}

export async function downloadImageArchive(
  results: ImageStudioGenerationResult[],
  prefix: string,
): Promise<void> {
  const blobs = await Promise.all(results.map(imageResultToBlob))
  const entries: Record<string, Uint8Array> = {}
  await Promise.all(blobs.map(async (blob, index) => {
    entries[safeImageFilename(blob, prefix, index)] = new Uint8Array(await blobBytes(blob))
  }))
  const archive = new Blob([zipSync(entries)], { type: 'application/zip' })
  saveBlob(archive, `${safeFilenamePart(prefix)}.zip`)
}

function imageExtension(blob: Blob): string {
  if (blob.type === 'image/jpeg') return 'jpg'
  return blob.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png'
}

function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.readAsArrayBuffer(blob)
  })
}

function safeFilenamePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/^[. ]+|[. ]+$/g, '') || 'image-studio-result'
}

function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    anchor.click()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
