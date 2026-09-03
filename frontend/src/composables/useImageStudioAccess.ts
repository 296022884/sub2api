import { computed, ref } from 'vue'
import { keysAPI } from '@/api/keys'
import { useAuthStore } from '@/stores/auth'
import type { ApiKey } from '@/types'

const loaded = ref(false)
const loading = ref(false)
const hasEligibleKey = ref(false)
const evaluatedUserId = ref<number | null>(null)
let pendingLoad: { userId: number; promise: Promise<boolean> } | null = null
const pageSize = 100

export function isEligibleImageStudioKey(key: ApiKey): boolean {
  return (
    key.status === 'active' &&
    key.group?.status === 'active' &&
    key.group?.platform === 'openai' &&
    key.group?.allow_image_generation === true
  )
}

export async function listEligibleImageStudioKeys(): Promise<ApiKey[]> {
  const keys: ApiKey[] = []
  let page = 1
  while (true) {
    const response = await keysAPI.list(page, pageSize, {
      status: 'active',
      sort_by: 'created_at',
      sort_order: 'desc',
    })
    keys.push(...(response.items || []).filter(isEligibleImageStudioKey))
    if (page >= response.pages || (response.items || []).length === 0) return keys
    page += 1
  }
}

async function loadImageStudioAccess(force = false): Promise<boolean> {
  const authStore = useAuthStore()
  const userId = authStore.user?.id
  if (!authStore.isAuthenticated || typeof userId !== 'number') {
    loaded.value = true
    hasEligibleKey.value = false
    evaluatedUserId.value = null
    return false
  }

  if (loaded.value && evaluatedUserId.value === userId && !force) return hasEligibleKey.value
  if (pendingLoad?.userId === userId && !force) return pendingLoad.promise

  loading.value = true
  const promise = (async () => {
    const eligible = (await listEligibleImageStudioKeys()).length > 0
    if (useAuthStore().user?.id === userId) {
      hasEligibleKey.value = eligible
      evaluatedUserId.value = userId
      loaded.value = true
    }
    return eligible
  })()
    .catch(() => {
      if (useAuthStore().user?.id === userId) {
        hasEligibleKey.value = false
        evaluatedUserId.value = userId
        loaded.value = true
      }
      return false
    })
    .finally(() => {
      if (pendingLoad?.promise === promise) {
        loading.value = false
        pendingLoad = null
      }
    })

  pendingLoad = { userId, promise }
  return promise
}

export function useImageStudioAccess() {
  const authStore = useAuthStore()
  return {
    canUseImageStudio: computed(
      () => evaluatedUserId.value === authStore.user?.id && hasEligibleKey.value,
    ),
    imageStudioAccessLoaded: computed(() => loaded.value),
    imageStudioAccessLoading: computed(() => loading.value),
    refreshImageStudioAccess: loadImageStudioAccess,
  }
}
