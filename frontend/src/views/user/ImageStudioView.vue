<template>
  <AppLayout>
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header class="mb-6">
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">{{ t('imageStudio.title') }}</h1>
      </header>

      <p v-if="featureBlocked" role="alert" class="mb-5 break-words border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
        {{ t('imageStudio.featureDisabled') }}
      </p>

      <div class="border-b border-gray-200 dark:border-dark-600">
        <div class="flex min-h-11 gap-6" role="tablist" :aria-label="t('imageStudio.title')">
          <button
            v-for="tab in tabs"
            :id="`image-studio-${tab}`"
            :key="tab"
            type="button"
            role="tab"
            class="border-b-2 px-1 py-3 text-sm font-medium"
            :class="activeTab === tab
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'"
            :aria-selected="activeTab === tab"
            @click="activeTab = tab"
          >
            {{ t(`imageStudio.tabs.${tab}`) }}
          </button>
        </div>
      </div>

      <section
        class="min-h-72 py-8"
        role="tabpanel"
        :aria-labelledby="`image-studio-${activeTab}`"
      >
        <template v-if="activeTab === 'generate'">
          <div class="grid gap-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
            <form class="space-y-5" @submit.prevent="generate">
              <div>
                <label for="image-studio-key" class="input-label mb-1.5 block">{{ t('imageStudio.apiKey') }}</label>
                <select
                  id="image-studio-key"
                  v-model.number="selectedKeyId"
                  class="input w-full"
                  :disabled="loadingKeys || submitting || editSubmitting || eligibleKeys.length === 0"
                >
                  <option v-for="key in eligibleKeys" :key="key.id" :value="key.id">
                    {{ key.name }} (...{{ key.key.slice(-4) }})
                  </option>
                </select>
              </div>

              <div v-if="loadingCapabilities" class="flex min-h-24 items-center justify-center">
                <LoadingSpinner />
              </div>
              <p v-else-if="capabilityError || !selectedModel" class="text-sm text-red-600 dark:text-red-400">
                {{ t('imageStudio.capabilitiesUnavailable') }}
              </p>
              <template v-else>
                <div>
                  <label for="image-studio-model" class="input-label mb-1.5 block">{{ t('imageStudio.model') }}</label>
                  <select id="image-studio-model" v-model="selectedModelId" data-testid="model-select" class="input w-full" :disabled="submitting">
                    <option v-for="model in capabilities?.models" :key="model.id" :value="model.id">{{ model.id }}</option>
                  </select>
                </div>

                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <CapabilitySelect v-if="selectedModel.parameters.size" id="image-studio-size" v-model="form.size" data-testid="size-select" :label="t('imageStudio.size')" :capability="selectedModel.parameters.size" :disabled="submitting" />
                  <CapabilitySelect v-if="selectedModel.parameters.quality" id="image-studio-quality" v-model="form.quality" data-testid="quality-select" :label="t('imageStudio.quality')" :capability="selectedModel.parameters.quality" :disabled="submitting" />
                  <CapabilitySelect v-if="selectedModel.parameters.background" id="image-studio-background" v-model="form.background" data-testid="background-select" :label="t('imageStudio.background')" :capability="selectedModel.parameters.background" :disabled="submitting" />
                  <CapabilitySelect v-if="selectedModel.parameters.output_format" id="image-studio-output-format" v-model="form.outputFormat" data-testid="output-format-select" :label="t('imageStudio.outputFormat')" :capability="selectedModel.parameters.output_format" :disabled="submitting" />
                  <div v-if="selectedModel.parameters.n">
                    <label for="image-studio-count" class="input-label mb-1.5 block">{{ t('imageStudio.imageCount') }}</label>
                    <input
                      id="image-studio-count"
                      v-model.number="form.n"
                      data-testid="image-count-input"
                      type="number"
                      class="input w-full"
                      :min="selectedModel.parameters.n.min"
                      :max="selectedModel.parameters.n.max"
                      :disabled="submitting"
                    />
                  </div>
                </div>

                <TextArea v-model="form.prompt" :label="t('imageStudio.prompt')" :placeholder="t('imageStudio.promptPlaceholder')" :rows="5" />
                <button
                  type="submit"
                  class="btn btn-primary flex h-10 w-full items-center justify-center"
                  :disabled="submitting || !canGenerate"
                >
                  <LoadingSpinner v-if="submitting" class="mr-2" />
                  {{ submitting ? t('imageStudio.generating') : t('imageStudio.generate') }}
                </button>
              </template>
            </form>

            <div class="flex min-h-80 items-center justify-center border-l-0 border-gray-200 lg:border-l lg:pl-8 dark:border-dark-600">
              <div v-if="submitting" class="text-center">
                <LoadingSpinner />
                <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">{{ t('imageStudio.generating') }}</p>
              </div>
              <div v-else-if="results.length" class="w-full">
                <p v-if="failedResultCount" class="mb-4 text-sm text-amber-700 dark:text-amber-300">{{ t('imageStudio.partialResult') }}</p>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div
                    v-for="(result, index) in results"
                    :key="`${generationId}-${index}`"
                    class="min-w-0"
                  >
                    <img
                      :src="result.src"
                      :alt="`${t('imageStudio.resultAlt')} ${index + 1}`"
                      data-testid="generated-image"
                      class="aspect-square w-full bg-gray-100 object-contain dark:bg-dark-800"
                    />
                    <button
                      type="button"
                      :data-testid="`edit-result-${index}`"
                      class="btn btn-secondary mt-2 flex h-9 w-full items-center justify-center"
                      :disabled="transferringResult !== null"
                      @click="transferResultToEdit(result, index)"
                    >
                      {{ transferringResult === index ? t('imageStudio.transferring') : t('imageStudio.editThisImage') }}
                    </button>
                    <button
                      type="button"
                      :data-testid="`download-result-${index}`"
                      class="btn btn-secondary mt-2 flex h-9 w-full items-center justify-center"
                      :disabled="downloadState.generate === 'preparing'"
                      @click="downloadResults('generate', results, index)"
                    >
                      {{ t('imageStudio.download') }}
                    </button>
                  </div>
                </div>
                <button v-if="results.length > 1" type="button" data-testid="download-all" class="btn btn-secondary mt-4 flex h-10 w-full items-center justify-center" :disabled="downloadState.generate === 'preparing'" @click="downloadResults('generate', results)">
                  {{ t('imageStudio.downloadAll') }}
                </button>
                <p v-if="downloadState.generate !== 'idle'" role="status" class="mt-3 text-sm text-gray-600 dark:text-gray-300">{{ downloadStateText('generate') }}</p>
                <p v-if="transferError" role="alert" class="mt-3 text-sm text-red-600 dark:text-red-400">{{ t('imageStudio.transferFailed') }}</p>
              </div>
              <StudioFailureMessage v-else-if="generationFailure" :failure="generationFailure" />
              <div v-else class="max-w-sm text-center">
                <h2 class="text-base font-semibold text-gray-900 dark:text-white">{{ t('imageStudio.blankTitle') }}</h2>
                <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{{ t('imageStudio.blankDescription') }}</p>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="grid gap-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
            <form data-testid="edit-form" class="space-y-5" @submit.prevent="edit">
              <div>
                <label for="image-studio-edit-key" class="input-label mb-1.5 block">{{ t('imageStudio.apiKey') }}</label>
                <select
                  id="image-studio-edit-key"
                  v-model.number="selectedKeyId"
                  class="input w-full"
                  :disabled="loadingKeys || submitting || editSubmitting || eligibleKeys.length === 0"
                >
                  <option v-for="key in eligibleKeys" :key="key.id" :value="key.id">
                    {{ key.name }} (...{{ key.key.slice(-4) }})
                  </option>
                </select>
              </div>

              <div v-if="loadingCapabilities" class="flex min-h-24 items-center justify-center">
                <LoadingSpinner />
              </div>
              <p v-else-if="capabilityError || !editModel" class="text-sm text-red-600 dark:text-red-400">
                {{ t('imageStudio.capabilitiesUnavailable') }}
              </p>
              <template v-else>
                <div>
                  <label for="image-studio-edit-model" class="input-label mb-1.5 block">{{ t('imageStudio.model') }}</label>
                  <select id="image-studio-edit-model" v-model="editModelId" class="input w-full" :disabled="editSubmitting">
                    <option v-for="model in editModels" :key="model.id" :value="model.id">{{ model.id }}</option>
                  </select>
                </div>

                <div>
                  <label class="input-label mb-1.5 block" for="image-studio-edit-files">{{ t('imageStudio.uploadImages') }}</label>
                  <label
                    data-testid="edit-drop-zone"
                    for="image-studio-edit-files"
                    class="flex min-h-28 cursor-pointer flex-col items-center justify-center border border-dashed border-gray-300 px-4 py-5 text-center text-sm text-gray-600 hover:border-primary-400 dark:border-dark-500 dark:text-gray-300"
                    @dragover.prevent
                    @drop.prevent="handleDrop"
                  >
                    {{ t('imageStudio.uploadHint') }}
                    <input
                      id="image-studio-edit-files"
                      data-testid="edit-file-input"
                      type="file"
                      class="sr-only"
                      multiple
                      :accept="capabilities?.uploads.mime_types.join(',')"
                      :disabled="editSubmitting"
                      @change="handleFileSelection"
                    />
                  </label>
                  <p v-if="uploadError" role="alert" class="mt-2 text-sm text-red-600 dark:text-red-400">{{ uploadError }}</p>
                  <ul v-if="uploads.length" class="mt-3 space-y-2">
                    <li v-for="(upload, index) in uploads" :key="upload.previewUrl" class="flex min-w-0 items-center gap-3 text-sm text-gray-700 dark:text-gray-200">
                      <img :src="upload.previewUrl" alt="" class="h-10 w-10 shrink-0 object-cover" />
                      <span class="min-w-0 flex-1 truncate">{{ upload.file.name }}</span>
                      <button type="button" class="btn btn-secondary px-2 py-1" :aria-label="t('imageStudio.removeImage')" @click="removeUpload(index)">×</button>
                    </li>
                  </ul>
                </div>

                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <CapabilitySelect v-if="editModel.parameters.size" id="image-studio-edit-size" v-model="editForm.size" :label="t('imageStudio.size')" :capability="editModel.parameters.size" :disabled="editSubmitting" />
                  <CapabilitySelect v-if="editModel.parameters.quality" id="image-studio-edit-quality" v-model="editForm.quality" :label="t('imageStudio.quality')" :capability="editModel.parameters.quality" :disabled="editSubmitting" />
                  <CapabilitySelect v-if="editModel.parameters.background" id="image-studio-edit-background" v-model="editForm.background" :label="t('imageStudio.background')" :capability="editModel.parameters.background" :disabled="editSubmitting" />
                  <CapabilitySelect v-if="editModel.parameters.output_format" id="image-studio-edit-output-format" v-model="editForm.outputFormat" :label="t('imageStudio.outputFormat')" :capability="editModel.parameters.output_format" :disabled="editSubmitting" />
                  <div v-if="editModel.parameters.n">
                    <label for="image-studio-edit-count" class="input-label mb-1.5 block">{{ t('imageStudio.imageCount') }}</label>
                    <input id="image-studio-edit-count" v-model.number="editForm.n" type="number" class="input w-full" :min="editModel.parameters.n.min" :max="editModel.parameters.n.max" :disabled="editSubmitting" />
                  </div>
                </div>

                <TextArea v-model="editForm.prompt" data-testid="edit-prompt" :label="t('imageStudio.editPrompt')" :placeholder="t('imageStudio.editPromptPlaceholder')" :rows="5" />
                <button type="submit" class="btn btn-primary flex h-10 w-full items-center justify-center" :disabled="editSubmitting || !canEdit">
                  <LoadingSpinner v-if="editSubmitting" class="mr-2" />
                  {{ editSubmitting ? t('imageStudio.editing') : t('imageStudio.edit') }}
                </button>
              </template>
            </form>

            <div class="flex min-h-80 items-center justify-center border-l-0 border-gray-200 lg:border-l lg:pl-8 dark:border-dark-600">
              <div v-if="editSubmitting" class="text-center">
                <LoadingSpinner />
                <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">{{ t('imageStudio.editing') }}</p>
              </div>
              <div v-else-if="editResults.length" class="w-full">
                <p v-if="editFailedResultCount" class="mb-4 text-sm text-amber-700 dark:text-amber-300">{{ t('imageStudio.partialResult') }}</p>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div v-for="(result, index) in editResults" :key="`${editGenerationId}-${index}`" class="min-w-0">
                    <img :src="result.src" :alt="`${t('imageStudio.resultAlt')} ${index + 1}`" data-testid="edited-image" class="aspect-square w-full bg-gray-100 object-contain dark:bg-dark-800" />
                    <button type="button" class="btn btn-secondary mt-2 flex h-9 w-full items-center justify-center" :disabled="downloadState.edit === 'preparing'" @click="downloadResults('edit', editResults, index)">{{ t('imageStudio.download') }}</button>
                  </div>
                </div>
                <button v-if="editResults.length > 1" type="button" class="btn btn-secondary mt-4 flex h-10 w-full items-center justify-center" :disabled="downloadState.edit === 'preparing'" @click="downloadResults('edit', editResults)">{{ t('imageStudio.downloadAll') }}</button>
                <p v-if="downloadState.edit !== 'idle'" role="status" class="mt-3 text-sm text-gray-600 dark:text-gray-300">{{ downloadStateText('edit') }}</p>
              </div>
              <StudioFailureMessage v-else-if="editFailure" :failure="editFailure" />
              <div v-else class="max-w-sm text-center">
                <h2 class="text-base font-semibold text-gray-900 dark:text-white">{{ t('imageStudio.editBlankTitle') }}</h2>
                <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{{ t('imageStudio.editBlankDescription') }}</p>
              </div>
            </div>
          </div>
        </template>
      </section>
    </main>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import CapabilitySelect from '@/components/image-studio/CapabilitySelect.vue'
import StudioFailureMessage from '@/components/image-studio/StudioFailureMessage.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import TextArea from '@/components/common/TextArea.vue'
import { listEligibleImageStudioKeys } from '@/composables/useImageStudioAccess'
import { useAppStore } from '@/stores/app'
import {
  downloadImageArchive,
  downloadImageResult,
  imageResultToFile,
  validateImageUploads,
} from '@/utils/imageStudioFiles'
import {
  generateImageStudioImages,
  editImageStudioImages,
  getImageStudioCapabilities,
  type ImageStudioCapabilities,
  type ImageStudioFailure,
  type ImageStudioGenerationResponse,
  type ImageStudioGenerationResult,
  type ImageStudioModelCapability,
  ImageStudioRequestError,
} from '@/api/imageStudio'
import type { ApiKey } from '@/types'

type StudioTab = 'generate' | 'edit'
type DownloadState = 'idle' | 'preparing' | 'success' | 'failed'
type StudioForm = { prompt: string; size: string; quality: string; background: string; outputFormat: string; n: number }

const { t } = useI18n()
const appStore = useAppStore()
const tabs: StudioTab[] = ['generate', 'edit']
const activeTab = ref<StudioTab>('generate')
const eligibleKeys = ref<ApiKey[]>([])
const selectedKeyId = ref<number | null>(null)
const capabilities = ref<ImageStudioCapabilities | null>(null)
const selectedModelId = ref('')
const loadingKeys = ref(true)
const loadingCapabilities = ref(false)
const capabilityError = ref(false)
const submitting = ref(false)
const generationFailure = ref<ImageStudioFailure | null>(null)
const results = ref<ImageStudioGenerationResult[]>([])
const failedResultCount = ref(0)
const generationId = ref(0)
const transferringResult = ref<number | null>(null)
const transferError = ref(false)
const downloadState = reactive<Record<StudioTab, DownloadState>>({ generate: 'idle', edit: 'idle' })
const editModelId = ref('')
const editSubmitting = ref(false)
const editFailure = ref<ImageStudioFailure | null>(null)
const editResults = ref<ImageStudioGenerationResult[]>([])
const editFailedResultCount = ref(0)
const editGenerationId = ref(0)
const uploadError = ref('')
const uploads = ref<Array<{ file: File; previewUrl: string }>>([])
let capabilityRequest = 0
let editRequest = 0
let replacingInvalidKey = false
const featureBlocked = ref(appStore.cachedPublicSettings?.image_studio_enabled === false)

const form = reactive<StudioForm>({ prompt: '', size: '', quality: '', background: '', outputFormat: '', n: 1 })
const editForm = reactive<StudioForm>({ prompt: '', size: '', quality: '', background: '', outputFormat: '', n: 1 })
const selectedKey = computed(() => eligibleKeys.value.find((key) => key.id === selectedKeyId.value))
const selectedModel = computed(() => capabilities.value?.models.find((model) => model.id === selectedModelId.value))
const editModels = computed(() => capabilities.value?.models.filter((model) => model.operations.includes('edit')) || [])
const editModel = computed(() => editModels.value.find((model) => model.id === editModelId.value))
const canGenerate = computed(() => {
  if (!selectedKey.value || !selectedModel.value || !form.prompt.trim()) return false
  const count = selectedModel.value.parameters.n
  return !count || (Number.isInteger(form.n) && form.n >= count.min && form.n <= count.max)
})
const canEdit = computed(() => {
  if (!selectedKey.value || !editModel.value || uploads.value.length === 0 || !editForm.prompt.trim()) return false
  const count = editModel.value.parameters.n
  return !count || (Number.isInteger(editForm.n) && editForm.n >= count.min && editForm.n <= count.max)
})

function clearUploads() {
  for (const upload of uploads.value) URL.revokeObjectURL(upload.previewUrl)
  uploads.value = []
}

function replaceUploads(files: File[]) {
  clearUploads()
  uploads.value = files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))
  editResults.value = []
  editFailedResultCount.value = 0
  editFailure.value = null
  downloadState.edit = 'idle'
}

function validateUploads(files: File[]): string {
  const limits = capabilities.value?.uploads
  if (!limits) return t('imageStudio.uploadErrors.mime')
  const error = validateImageUploads(files, limits)
  return error ? t(`imageStudio.uploadErrors.${error}`) : ''
}

function acceptUploads(files: File[]) {
  const error = validateUploads(files)
  uploadError.value = error
  if (!error) replaceUploads(files)
}

function handleFileSelection(event: Event) {
  const input = event.target as HTMLInputElement
  acceptUploads(Array.from(input.files || []))
  input.value = ''
}

function handleDrop(event: DragEvent) {
  acceptUploads(Array.from(event.dataTransfer?.files || []))
}

function removeUpload(index: number) {
  const [removed] = uploads.value.splice(index, 1)
  if (removed) URL.revokeObjectURL(removed.previewUrl)
  uploadError.value = ''
}

function downloadStateText(kind: StudioTab) {
  const keys: Record<Exclude<DownloadState, 'idle'>, string> = {
    preparing: 'imageStudio.downloadPreparing',
    success: 'imageStudio.downloadSuccess',
    failed: 'imageStudio.downloadFailed',
  }
  const state = downloadState[kind]
  return state === 'idle' ? '' : t(keys[state])
}

function syncFeatureBlocked() {
  const enabled = appStore.cachedPublicSettings?.image_studio_enabled
  if (enabled !== undefined) featureBlocked.value = enabled !== true
}

async function refreshFeatureBlocked() {
  const settings = await appStore.fetchPublicSettings(true)
  featureBlocked.value = settings?.image_studio_enabled !== true
  return featureBlocked.value
}

function failureFrom(error: unknown): ImageStudioFailure {
  if (error instanceof ImageStudioRequestError) {
    return { kind: error.kind, requestId: error.requestId, retryAfterSeconds: error.retryAfterSeconds }
  }
  return { kind: 'unknown' }
}

async function removeSelectedKeyAfterInvalidFailure(failure: ImageStudioFailure) {
  if (failure.kind !== 'invalidKey' || selectedKeyId.value === null) return false
  replacingInvalidKey = true
  eligibleKeys.value = eligibleKeys.value.filter((key) => key.id !== selectedKeyId.value)
  selectedKeyId.value = eligibleKeys.value[0]?.id ?? null
  await nextTick()
  return true
}

async function downloadResults(kind: StudioTab, availableResults: ImageStudioGenerationResult[], onlyIndex?: number) {
  if (downloadState[kind] === 'preparing') return
  downloadState[kind] = 'preparing'
  try {
    if (onlyIndex !== undefined) {
      await downloadImageResult(availableResults[onlyIndex], t('imageStudio.downloadFilename'), onlyIndex)
    } else {
      await downloadImageArchive(availableResults, t('imageStudio.downloadFilename'))
    }
    downloadState[kind] = 'success'
  } catch {
    downloadState[kind] = 'failed'
  }
}

async function transferResultToEdit(result: ImageStudioGenerationResult, index: number) {
  if (transferringResult.value !== null) return
  transferringResult.value = index
  transferError.value = false
  try {
    const file = await imageResultToFile(result, t('imageStudio.transferFilename'))
    const validationError = validateUploads([file])
    if (validationError) {
      uploadError.value = validationError
      transferError.value = true
      return
    }
    replaceUploads([file])
    uploadError.value = ''
    activeTab.value = 'edit'
  } catch {
    transferError.value = true
  } finally {
    transferringResult.value = null
  }
}

function resetParameterDefaults(
  target: StudioForm,
  parameters?: ImageStudioModelCapability['parameters'],
) {
  target.size = parameters?.size?.default || ''
  target.quality = parameters?.quality?.default || ''
  target.background = parameters?.background?.default || ''
  target.outputFormat = parameters?.output_format?.default || ''
  target.n = parameters?.n?.default || 1
}

function imageRequestPayload(
  model: string,
  target: StudioForm,
  parameters: ImageStudioModelCapability['parameters'],
): Record<string, string | number> {
  const payload: Record<string, string | number> = { model, prompt: target.prompt.trim() }
  if (parameters.size) payload.size = target.size
  if (parameters.quality) payload.quality = target.quality
  if (parameters.background) payload.background = target.background
  if (parameters.output_format) payload.output_format = target.outputFormat
  if (parameters.n) payload.n = target.n
  return payload
}

interface StudioOperationCallbacks {
  isCurrent: () => boolean
  setSubmitting: (value: boolean) => void
  clearResult: () => void
  submit: () => Promise<ImageStudioGenerationResponse>
  applyResult: (response: ImageStudioGenerationResponse) => void
  setFailure: (failure: ImageStudioFailure) => void
}

async function runStudioOperation(operation: StudioOperationCallbacks) {
  operation.setSubmitting(true)
  operation.clearResult()
  let submitted = false
  try {
    if (await refreshFeatureBlocked()) return
    submitted = true
    const response = await operation.submit()
    if (!operation.isCurrent()) return
    operation.applyResult(response)
    if (response.images.length === 0) operation.setFailure({ kind: 'unknown' })
  } catch (error) {
    if (!operation.isCurrent()) return
    const failure = failureFrom(error)
    await removeSelectedKeyAfterInvalidFailure(failure)
    operation.setFailure(failure)
  } finally {
    if (operation.isCurrent()) operation.setSubmitting(false)
    if (submitted) await refreshFeatureBlocked()
  }
}

function resetEditModelValues() {
  const parameters = editModel.value?.parameters
  resetParameterDefaults(editForm, parameters)
  clearUploads()
  uploadError.value = ''
  editResults.value = []
  editFailedResultCount.value = 0
  if (!replacingInvalidKey) editFailure.value = null
  downloadState.edit = 'idle'
}

async function edit() {
  syncFeatureBlocked()
  if (editSubmitting.value || !canEdit.value || !selectedKey.value || !editModel.value) return
  const request = ++editRequest
  const key = selectedKey.value.key
  const parameters = editModel.value.parameters
  const payload = imageRequestPayload(editModel.value.id, editForm, parameters)
  await runStudioOperation({
    isCurrent: () => request === editRequest,
    setSubmitting: (value) => { editSubmitting.value = value },
    clearResult: () => {
      editFailure.value = null
      editResults.value = []
      editFailedResultCount.value = 0
      downloadState.edit = 'idle'
    },
    submit: () => editImageStudioImages(key, uploads.value.map(({ file }) => file), payload, parameters.output_format ? editForm.outputFormat : 'png'),
    applyResult: (response) => {
      editResults.value = response.images
      editFailedResultCount.value = response.failedCount
      editGenerationId.value += 1
    },
    setFailure: (failure) => { editFailure.value = failure },
  })
}

function resetModelValues() {
  const parameters = selectedModel.value?.parameters
  resetParameterDefaults(form, parameters)
  results.value = []
  failedResultCount.value = 0
  if (!replacingInvalidKey) generationFailure.value = null
  downloadState.generate = 'idle'
}

async function generate() {
  syncFeatureBlocked()
  if (submitting.value || !canGenerate.value || !selectedKey.value || !selectedModel.value) return
  const key = selectedKey.value.key
  const parameters = selectedModel.value.parameters
  const payload = imageRequestPayload(selectedModel.value.id, form, parameters)
  await runStudioOperation({
    isCurrent: () => true,
    setSubmitting: (value) => { submitting.value = value },
    clearResult: () => {
      generationFailure.value = null
      results.value = []
      failedResultCount.value = 0
      downloadState.generate = 'idle'
    },
    submit: () => generateImageStudioImages(
      key,
      payload,
      parameters.output_format ? form.outputFormat : 'png',
    ),
    applyResult: (response) => {
      results.value = response.images
      failedResultCount.value = response.failedCount
      generationId.value += 1
    },
    setFailure: (failure) => { generationFailure.value = failure },
  })
}

watch(selectedModelId, resetModelValues)
watch(() => appStore.cachedPublicSettings?.image_studio_enabled, (enabled) => {
  featureBlocked.value = enabled !== true
})
watch(editModelId, () => {
  editRequest += 1
  editSubmitting.value = false
  resetEditModelValues()
})

watch(selectedKeyId, async () => {
  editRequest += 1
  editSubmitting.value = false
  const request = ++capabilityRequest
  capabilities.value = null
  selectedModelId.value = ''
  editModelId.value = ''
  capabilityError.value = false
  if (!selectedKey.value) return
  loadingCapabilities.value = true
  try {
    const loaded = await getImageStudioCapabilities(selectedKey.value.key)
    if (request !== capabilityRequest) return
    capabilities.value = loaded
    selectedModelId.value = loaded.models.find((model) => model.operations.includes('generate'))?.id || ''
    editModelId.value = loaded.models.find((model) => model.operations.includes('edit'))?.id || ''
  } catch {
    if (request === capabilityRequest) capabilityError.value = true
  } finally {
    if (request === capabilityRequest) loadingCapabilities.value = false
    await nextTick()
    replacingInvalidKey = false
  }
})

onMounted(async () => {
  try {
    eligibleKeys.value = await listEligibleImageStudioKeys()
    selectedKeyId.value = eligibleKeys.value[0]?.id ?? null
  } finally {
    loadingKeys.value = false
  }
})

onBeforeUnmount(() => {
  editRequest += 1
  clearUploads()
})
</script>
