<template>
  <AppLayout>
    <main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header class="mb-6">
        <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">{{ t('imageStudio.title') }}</h1>
      </header>

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
                  :disabled="loadingKeys || submitting || eligibleKeys.length === 0"
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
                  <img
                    v-for="(result, index) in results"
                    :key="`${generationId}-${index}`"
                    :src="result.src"
                    :alt="`${t('imageStudio.resultAlt')} ${index + 1}`"
                    data-testid="generated-image"
                    class="aspect-square w-full bg-gray-100 object-contain dark:bg-dark-800"
                  />
                </div>
              </div>
              <p v-else-if="generationError" class="text-sm text-red-600 dark:text-red-400">{{ t('imageStudio.generationFailed') }}</p>
              <div v-else class="max-w-sm text-center">
                <h2 class="text-base font-semibold text-gray-900 dark:text-white">{{ t('imageStudio.blankTitle') }}</h2>
                <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{{ t('imageStudio.blankDescription') }}</p>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t('imageStudio.tabs.edit') }}</h2>
          <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{{ t('imageStudio.editDescription') }}</p>
        </template>
      </section>
    </main>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import CapabilitySelect from '@/components/image-studio/CapabilitySelect.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import TextArea from '@/components/common/TextArea.vue'
import { keysAPI } from '@/api/keys'
import {
  generateImageStudioImages,
  getImageStudioCapabilities,
  type ImageStudioCapabilities,
  type ImageStudioGenerationResult,
} from '@/api/imageStudio'
import type { ApiKey } from '@/types'

type StudioTab = 'generate' | 'edit'

const { t } = useI18n()
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
const generationError = ref(false)
const results = ref<ImageStudioGenerationResult[]>([])
const failedResultCount = ref(0)
const generationId = ref(0)
let capabilityRequest = 0

const form = reactive({ prompt: '', size: '', quality: '', background: '', outputFormat: '', n: 1 })
const selectedKey = computed(() => eligibleKeys.value.find((key) => key.id === selectedKeyId.value))
const selectedModel = computed(() => capabilities.value?.models.find((model) => model.id === selectedModelId.value))
const canGenerate = computed(() => {
  if (!selectedKey.value || !selectedModel.value || !form.prompt.trim()) return false
  const count = selectedModel.value.parameters.n
  return !count || (Number.isInteger(form.n) && form.n >= count.min && form.n <= count.max)
})

function resetModelValues() {
  const parameters = selectedModel.value?.parameters
  form.size = parameters?.size?.default || ''
  form.quality = parameters?.quality?.default || ''
  form.background = parameters?.background?.default || ''
  form.outputFormat = parameters?.output_format?.default || ''
  form.n = parameters?.n?.default || 1
  results.value = []
  failedResultCount.value = 0
  generationError.value = false
}

async function generate() {
  if (submitting.value || !canGenerate.value || !selectedKey.value || !selectedModel.value) return
  const parameters = selectedModel.value.parameters
  const payload: Record<string, string | number> = {
    model: selectedModel.value.id,
    prompt: form.prompt.trim(),
  }
  if (parameters.size) payload.size = form.size
  if (parameters.quality) payload.quality = form.quality
  if (parameters.background) payload.background = form.background
  if (parameters.output_format) payload.output_format = form.outputFormat
  if (parameters.n) payload.n = form.n

  submitting.value = true
  generationError.value = false
  results.value = []
  failedResultCount.value = 0
  try {
    const response = await generateImageStudioImages(
      selectedKey.value.key,
      payload,
      parameters.output_format ? form.outputFormat : 'png',
    )
    results.value = response.images
    failedResultCount.value = response.failedCount
    generationId.value += 1
    generationError.value = response.images.length === 0
  } catch {
    generationError.value = true
  } finally {
    submitting.value = false
  }
}

watch(selectedModelId, resetModelValues)

watch(selectedKeyId, async () => {
  const request = ++capabilityRequest
  capabilities.value = null
  selectedModelId.value = ''
  capabilityError.value = false
  if (!selectedKey.value) return
  loadingCapabilities.value = true
  try {
    const loaded = await getImageStudioCapabilities(selectedKey.value.key)
    if (request !== capabilityRequest) return
    capabilities.value = loaded
    selectedModelId.value = loaded.models.find((model) => model.operations.includes('generate'))?.id || ''
  } catch {
    if (request === capabilityRequest) capabilityError.value = true
  } finally {
    if (request === capabilityRequest) loadingCapabilities.value = false
  }
})

onMounted(async () => {
  try {
    const keys: ApiKey[] = []
    let page = 1
    while (true) {
      const response = await keysAPI.list(page, 100, { status: 'active', sort_by: 'created_at', sort_order: 'desc' })
      keys.push(...(response.items || []))
      if (page >= response.pages || (response.items || []).length === 0) break
      page += 1
    }
    eligibleKeys.value = keys.filter((key) => key.status === 'active'
      && key.group?.platform === 'openai' && key.group?.allow_image_generation === true)
    selectedKeyId.value = eligibleKeys.value[0]?.id ?? null
  } finally {
    loadingKeys.value = false
  }
})
</script>
