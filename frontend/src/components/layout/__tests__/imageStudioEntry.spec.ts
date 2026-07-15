import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppSidebar from '../AppSidebar.vue'

const state = vi.hoisted(() => ({
  imageStudioEnabled: true,
  hasEligibleKey: true,
  userId: 1,
}))

const keysAPI = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock('@/stores', () => ({
  useAppStore: () => ({
    cachedPublicSettings: { image_studio_enabled: state.imageStudioEnabled },
    publicSettingsLoaded: true,
    sidebarCollapsed: false,
    mobileOpen: false,
    sidebarScrollTop: 0,
    siteName: 'Sub2API',
    siteLogo: '',
    siteVersion: 'test',
    setMobileOpen: vi.fn(),
    toggleSidebar: vi.fn(),
  }),
  useAuthStore: () => ({
    isAuthenticated: true,
    isAdmin: false,
    isSimpleMode: false,
    user: { id: state.userId },
  }),
  useOnboardingStore: () => ({ isCurrentStep: false, nextStep: vi.fn() }),
  useAdminSettingsStore: () => ({
    customMenuItems: [],
    opsMonitoringEnabled: false,
    paymentEnabled: false,
    fetch: vi.fn(),
  }),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    cachedPublicSettings: { image_studio_enabled: state.imageStudioEnabled },
  }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    user: { id: state.userId },
  }),
}))

vi.mock('@/api/keys', () => ({ keysAPI }))

vi.mock('@/composables/useBatchImageAccess', () => ({
  useBatchImageAccess: () => ({ canUseBatchImage: { value: false }, refreshBatchImageAccess: vi.fn() }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/dashboard' }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key === 'nav.imageStudio' ? 'AI Images' : key }),
}))

describe('Image Studio sidebar entry', () => {
  beforeEach(() => {
    state.imageStudioEnabled = true
    state.hasEligibleKey = true
    state.userId = 1
    keysAPI.list.mockReset()
    keysAPI.list.mockImplementation(async () => ({
      items: state.hasEligibleKey
        ? [{ status: 'active', group: { status: 'active', platform: 'openai', allow_image_generation: true } }]
        : [],
      pages: 1,
    }))
  })

  it('is visible only when the flag and current user eligibility are both true', async () => {
    const admitted = shallowMount(AppSidebar)
    await flushPromises()
    expect(admitted.text()).toContain('AI Images')

    state.hasEligibleKey = false
    state.userId = 2
    const noKey = shallowMount(AppSidebar)
    await flushPromises()
    expect(noKey.text()).not.toContain('AI Images')

    state.hasEligibleKey = true
    state.imageStudioEnabled = false
    const disabled = shallowMount(AppSidebar)
    await flushPromises()
    expect(disabled.text()).not.toContain('AI Images')
  })
})
