<template>
  <div role="alert" class="max-w-md break-words text-sm text-red-600 dark:text-red-400">
    <p>{{ message }}</p>
    <p v-if="failure.requestId" class="mt-2 font-mono text-xs text-gray-600 dark:text-gray-300">
      {{ t('imageStudio.errors.requestId', { requestId: failure.requestId }) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ImageStudioFailure } from '@/api/imageStudio'

const props = defineProps<{ failure: ImageStudioFailure }>()
const { t } = useI18n()
const message = computed(() => props.failure.kind === 'rateLimited'
  ? t('imageStudio.errors.rateLimited', { seconds: props.failure.retryAfterSeconds ?? 60 })
  : t(`imageStudio.errors.${props.failure.kind}`))
</script>
