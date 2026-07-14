<template>
  <div>
    <label :for="id" class="input-label mb-1.5 block">{{ label }}</label>
    <select :id="id" :value="modelValue" class="input w-full" :disabled="disabled" @change="onChange">
      <option v-for="value in capability.values" :key="value" :value="value">{{ value }}</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import type { ImageStudioEnumCapability } from '@/api/imageStudio'

defineProps<{
  id?: string
  modelValue: string
  label: string
  capability: ImageStudioEnumCapability
  disabled?: boolean
}>()

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()

function onChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
</script>
