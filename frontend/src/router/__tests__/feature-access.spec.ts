import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type NavigationGuard = (
  to: Record<string, any>,
  from: Record<string, any>,
  next: ReturnType<typeof vi.fn>
) => Promise<void>

const routerHarness = vi.hoisted(() => ({
  guard: null as NavigationGuard | null,
  routes: [] as Array<Record<string, any>>,
}))

const authStore = vi.hoisted(() => ({
  checkAuth: vi.fn(),
  isAuthenticated: true,
  isAdmin: false,
  isSimpleMode: false,
  hasPendingAuthSession: false,
  user: { id: 1 },
}))

const appStore = vi.hoisted(() => ({
  siteName: 'Sub2API',
  backendModeEnabled: false,
  publicSettingsLoaded: false,
  cachedPublicSettings: null as null | {
    payment_enabled?: boolean
    risk_control_enabled?: boolean
    image_studio_enabled?: boolean
    custom_menu_items?: []
  },
  fetchPublicSettings: vi.fn(),
}))

const keysAPI = vi.hoisted(() => ({
  list: vi.fn(),
}))

vi.mock('@/api/keys', () => ({ keysAPI }))

vi.mock('vue-router', () => ({
  createWebHistory: vi.fn(() => ({})),
  createRouter: vi.fn((options: { routes: Array<Record<string, any>> }) => {
    routerHarness.routes = options.routes
    return ({
    beforeEach: vi.fn((guard: NavigationGuard) => {
      routerHarness.guard = guard
    }),
    afterEach: vi.fn(),
    onError: vi.fn(),
    })
  }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authStore,
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => appStore,
}))

vi.mock('@/stores/adminSettings', () => ({
  useAdminSettingsStore: () => ({ customMenuItems: [] }),
}))

vi.mock('@/stores/adminCompliance', () => ({
  useAdminComplianceStore: () => ({
    initialized: true,
    fetchStatus: vi.fn(),
    requireAcknowledgement: vi.fn(),
  }),
}))

vi.mock('@/composables/useNavigationLoading', () => ({
  useNavigationLoadingState: () => ({
    startNavigation: vi.fn(),
    endNavigation: vi.fn(),
    isLoading: { value: false },
  }),
}))

vi.mock('@/composables/useRoutePrefetch', () => ({
  useRoutePrefetch: () => ({
    triggerPrefetch: vi.fn(),
    cancelPendingPrefetch: vi.fn(),
    resetPrefetchState: vi.fn(),
  }),
}))

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function runGuard(meta: Record<string, unknown>, path: string) {
  if (!routerHarness.guard) {
    throw new Error('router guard was not registered')
  }

  const next = vi.fn()
  const navigation = routerHarness.guard(
    {
      path,
      fullPath: path,
      name: 'FeatureRoute',
      params: {},
      meta: { requiresAuth: true, ...meta },
    },
    {},
    next
  )
  return { navigation, next }
}

describe('feature route guard', () => {
  beforeAll(async () => {
    await import('@/router')
  })

  beforeEach(() => {
    authStore.isAuthenticated = true
    authStore.isAdmin = false
    authStore.isSimpleMode = false
    appStore.publicSettingsLoaded = false
    appStore.cachedPublicSettings = null
    appStore.fetchPublicSettings.mockReset()
    keysAPI.list.mockReset()
  })

  it('preserves the existing Batch Image Generation route and alias', () => {
    const batchRoute = routerHarness.routes.find((route) => route.path === '/batch-image')
    expect(batchRoute).toMatchObject({
      name: 'BatchImageGuide',
      alias: '/docs/batch-image',
    })
  })

  it('admits Image Studio only when enabled and an eligible OpenAI key exists', async () => {
    appStore.cachedPublicSettings = { image_studio_enabled: true }
    appStore.publicSettingsLoaded = true
    appStore.fetchPublicSettings.mockResolvedValue({ image_studio_enabled: true })
    keysAPI.list.mockResolvedValue({
      items: [{ status: 'active', group: { status: 'active', platform: 'openai', allow_image_generation: true } }],
      pages: 1,
    })

    const { navigation, next } = runGuard({ requiresImageStudio: true }, '/image-studio')
    await navigation

    expect(keysAPI.list).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledWith()
  })

  it.each([
    ['unloaded settings', null, false],
    ['disabled settings', { image_studio_enabled: false }, true],
  ])('redirects Image Studio to the dashboard for %s', async (_name, settings, loaded) => {
    appStore.cachedPublicSettings = settings
    appStore.publicSettingsLoaded = loaded
    appStore.fetchPublicSettings.mockResolvedValue(null)

    const { navigation, next } = runGuard({ requiresImageStudio: true }, '/image-studio')
    await navigation

    expect(keysAPI.list).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith('/dashboard')
  })

  it('redirects Image Studio users without an eligible key to key management', async () => {
    appStore.cachedPublicSettings = { image_studio_enabled: true }
    appStore.publicSettingsLoaded = true
    appStore.fetchPublicSettings.mockResolvedValue({ image_studio_enabled: true })
    keysAPI.list.mockResolvedValue({
      items: [
        { status: 'inactive', group: { platform: 'openai', allow_image_generation: true } },
        { status: 'active', group: { platform: 'gemini', allow_image_generation: true } },
        { status: 'active', group: { platform: 'openai', allow_image_generation: false } },
        { status: 'active', group: { status: 'inactive', platform: 'openai', allow_image_generation: true } },
      ],
      pages: 1,
    })

    const { navigation, next } = runGuard({ requiresImageStudio: true }, '/image-studio')
    await navigation

    expect(next).toHaveBeenCalledWith({
      path: '/keys',
      query: { notice: 'image-studio-key-required' },
    })
  })

  it('rejects Image Studio when a fresh settings response disables it', async () => {
    appStore.cachedPublicSettings = { image_studio_enabled: true }
    appStore.publicSettingsLoaded = true
    appStore.fetchPublicSettings.mockImplementation(async () => {
      appStore.cachedPublicSettings = { image_studio_enabled: false }
      return appStore.cachedPublicSettings
    })

    const { navigation, next } = runGuard({ requiresImageStudio: true }, '/image-studio')
    await navigation

    expect(appStore.fetchPublicSettings).toHaveBeenCalledWith(true)
    expect(keysAPI.list).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith('/dashboard')
  })

  it('waits for the first public-settings request before deciding payment access', async () => {
    const deferred = createDeferred<{ payment_enabled: boolean }>()
    appStore.fetchPublicSettings.mockImplementation(async () => {
      const settings = await deferred.promise
      appStore.cachedPublicSettings = settings
      appStore.publicSettingsLoaded = true
      return settings
    })

    const { navigation, next } = runGuard({ requiresPayment: true }, '/purchase')

    await vi.waitFor(() => expect(appStore.fetchPublicSettings).toHaveBeenCalledTimes(1))
    expect(next).not.toHaveBeenCalled()

    deferred.resolve({ payment_enabled: true })
    await navigation
    expect(next).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledWith()
  })

  it.each([
    ['payment', { requiresPayment: true }, '/purchase'],
    ['risk control', { requiresRiskControl: true }, '/admin/risk-control'],
  ])('does not treat a failed %s settings load as explicitly disabled', async (_name, meta, path) => {
    authStore.isAdmin = meta.requiresRiskControl === true
    appStore.fetchPublicSettings.mockResolvedValue(null)

    const { navigation, next } = runGuard(meta, path)
    await navigation

    expect(appStore.publicSettingsLoaded).toBe(false)
    expect(next).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledWith()
  })

  it.each([
    ['payment', { requiresPayment: true }, { payment_enabled: false }, '/dashboard'],
    [
      'risk control',
      { requiresRiskControl: true },
      { risk_control_enabled: false },
      '/admin/settings',
    ],
  ])('redirects when loaded settings explicitly disable %s', async (_name, meta, settings, target) => {
    authStore.isAdmin = meta.requiresRiskControl === true
    appStore.cachedPublicSettings = settings
    appStore.publicSettingsLoaded = true

    const { navigation, next } = runGuard(meta, '/feature')
    await navigation

    expect(appStore.fetchPublicSettings).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledWith(target)
  })
})
