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
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          {{ t(`imageStudio.tabs.${activeTab}`) }}
        </h2>
        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {{ t(`imageStudio.${activeTab}Description`) }}
        </p>
      </section>
    </main>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'

type StudioTab = 'generate' | 'edit'

const { t } = useI18n()
const tabs: StudioTab[] = ['generate', 'edit']
const activeTab = ref<StudioTab>('generate')
</script>
