import { mount } from '@vue/test-utils'
import { unzipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImageStudioView from '../ImageStudioView.vue'

const { appStore, listKeys } = vi.hoisted(() => ({
  appStore: {
    cachedPublicSettings: { image_studio_enabled: true },
    fetchPublicSettings: vi.fn(),
  },
  listKeys: vi.fn(),
}))

vi.mock('@/api/keys', () => ({ keysAPI: { list: listKeys } }))
vi.mock('@/stores/app', () => ({ useAppStore: () => appStore }))

const capabilitiesFixture = {
  operations: ['generate', 'edit'],
  models: [{
    id: 'gpt-image-2',
    operations: ['generate', 'edit'],
    parameters: {
      size: { values: ['auto', '1024x1024'], default: 'auto' },
      quality: { values: ['auto', 'high'], default: 'auto' },
      output_format: { values: ['png', 'webp'], default: 'png' },
    },
  }],
  uploads: {
    mime_types: ['image/png', 'image/jpeg'],
    max_files: 2,
    max_file_bytes: 8,
    max_total_bytes: 12,
  },
}

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => ({
      'imageStudio.title': 'Image Studio',
      'imageStudio.tabs.generate': 'Generate',
      'imageStudio.tabs.edit': 'Edit',
      'imageStudio.generateDescription': 'Generate description',
      'imageStudio.editDescription': 'Edit description',
      'imageStudio.apiKey': 'API key',
      'imageStudio.model': 'Model',
      'imageStudio.prompt': 'Prompt',
      'imageStudio.promptPlaceholder': 'Describe an image',
      'imageStudio.size': 'Size',
      'imageStudio.quality': 'Quality',
      'imageStudio.background': 'Background',
      'imageStudio.outputFormat': 'Output format',
      'imageStudio.imageCount': 'Images',
      'imageStudio.generate': 'Generate image',
      'imageStudio.generating': 'Generating image',
      'imageStudio.blankTitle': 'Your images will appear here',
      'imageStudio.blankDescription': 'Enter a prompt to begin.',
      'imageStudio.capabilitiesUnavailable': 'Image controls are unavailable.',
      'imageStudio.partialResult': 'Some images could not be generated.',
      'imageStudio.resultAlt': 'Generated image',
      'imageStudio.uploadImages': 'Source images',
      'imageStudio.uploadHint': 'Choose or drop images',
      'imageStudio.removeImage': 'Remove image',
      'imageStudio.editPrompt': 'Edit instructions',
      'imageStudio.editPromptPlaceholder': 'Describe the changes',
      'imageStudio.edit': 'Edit image',
      'imageStudio.editing': 'Editing image',
      'imageStudio.editBlankTitle': 'Edited images will appear here',
      'imageStudio.editBlankDescription': 'Add source images and instructions to begin.',
      'imageStudio.uploadErrors.mime': 'This file type is not supported.',
      'imageStudio.uploadErrors.count': 'Too many images selected.',
      'imageStudio.uploadErrors.fileSize': 'An image is too large.',
      'imageStudio.uploadErrors.totalSize': 'The images are too large together.',
      'imageStudio.editFailed': 'The image could not be edited.',
      'imageStudio.editThisImage': 'Edit this image',
      'imageStudio.transferring': 'Preparing image',
      'imageStudio.transferFailed': 'The image could not be prepared for editing.',
      'imageStudio.transferFilename': 'image-studio-source',
      'imageStudio.download': 'Download',
      'imageStudio.downloadAll': 'Download all',
      'imageStudio.downloadPreparing': 'Preparing download',
      'imageStudio.downloadSuccess': 'Download ready',
      'imageStudio.downloadFailed': 'Download failed',
      'imageStudio.downloadFilename': 'image-studio-result',
      'imageStudio.featureDisabled': 'Image Studio has been disabled. New requests are blocked.',
      'imageStudio.errors.rateLimited': 'Too many requests. Try again in {seconds} seconds.',
      'imageStudio.errors.insufficientBalance': 'Your balance is too low for this request.',
      'imageStudio.errors.moderationRejected': 'The request was rejected by content policy.',
      'imageStudio.errors.invalidKey': 'This API key is invalid or has been revoked.',
      'imageStudio.errors.unknown': 'The request failed. Try again manually.',
      'imageStudio.errors.requestId': 'Request ID: {requestId}',
    } as Record<string, string>)[key]?.replace(/\{(\w+)\}/g, (_match, name) => String(params?.[name] ?? '')) ?? key,
  }),
}))

function mountStudio() {
  return mount(ImageStudioView, {
    global: { stubs: { AppLayout: { template: '<div><slot /></div>' } } },
  })
}

async function mountReadyStudio() {
  const wrapper = mountStudio()
  await vi.waitFor(() => expect(wrapper.find('[data-testid="model-select"]').exists()).toBe(true))
  return wrapper
}

describe('Image Studio workspace shell', () => {
  beforeEach(() => {
    appStore.cachedPublicSettings = { image_studio_enabled: true }
    appStore.fetchPublicSettings.mockImplementation(async () => appStore.cachedPublicSettings)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((file: File) => `blob:${file.name}`),
    })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    listKeys.mockResolvedValue({
      items: [
        {
          id: 7,
          key: 'sk-first-1234',
          name: 'Primary images',
          status: 'active',
          group: { status: 'active', platform: 'openai', allow_image_generation: true },
        },
        {
          id: 8,
          key: 'sk-second-5678',
          name: 'Backup images',
          status: 'active',
          group: { status: 'active', platform: 'openai', allow_image_generation: true },
        },
      ],
      pages: 1,
    })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(capabilitiesFixture), { status: 200 })))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('shows only Generate and Edit and selects Generate by default', async () => {
    const wrapper = mountStudio()

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map((tab) => tab.text())).toEqual(['Generate', 'Edit'])
    expect(tabs[0].attributes('aria-selected')).toBe('true')

    await tabs[1].trigger('click')
    expect(wrapper.get('[role="tabpanel"]').text()).toContain('Edited images will appear here')
  })

  it('selects the first eligible key and renders only server-authored controls', async () => {
    const wrapper = await mountReadyStudio()

    expect(wrapper.text()).toContain('Primary images')
    expect(wrapper.text()).toContain('...1234')
    expect(wrapper.text()).not.toContain('sk-first-1234')
    expect((wrapper.get('[data-testid="model-select"]').element as HTMLSelectElement).value).toBe('gpt-image-2')
    expect(wrapper.find('[data-testid="size-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="quality-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="background-select"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="output-format-select"]').exists()).toBe(true)
    expect(wrapper.find('#image-studio-count').exists()).toBe(false)
  })

  it('submits only supported fields with the selected key and renders base64 and URL images', async () => {
    const wrapper = await mountReadyStudio()

    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      data: [
        { b64_json: 'aW1hZ2UtYnl0ZXM=' },
        { url: 'https://images.example/result.png' },
      ],
    }), { status: 200 }))

    await wrapper.get('textarea').setValue('A quiet city at dawn')
    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="generated-image"]')).toHaveLength(2))
    const generationCall = fetchMock.mock.calls[1]
    expect(new URL(String(generationCall?.[0]), window.location.origin).pathname).toBe('/v1/images/generations')
    expect(generationCall?.[1]?.headers).toEqual({
      Authorization: 'Bearer sk-first-1234',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(generationCall?.[1]?.body))).toEqual({
      model: 'gpt-image-2',
      prompt: 'A quiet city at dawn',
      size: 'auto',
      quality: 'auto',
      output_format: 'png',
    })
    expect(wrapper.findAll('[data-testid="generated-image"]')[0].attributes('src')).toBe('data:image/png;base64,aW1hZ2UtYnl0ZXM=')
    expect(wrapper.findAll('[data-testid="generated-image"]')[1].attributes('src')).toBe('https://images.example/result.png')
  })

  it('keeps successful images from a partial response and clears them when the key changes', async () => {
    const wrapper = await mountReadyStudio()

    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      data: [{ b64_json: 'c3VjY2Vzcw==' }, { error: { type: 'provider_error' } }],
    }), { status: 200 }))
    await wrapper.get('textarea').setValue('A paper sculpture')
    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="generated-image"]')).toHaveLength(1))
    expect(wrapper.text()).toContain('Some images could not be generated.')

    await wrapper.get('#image-studio-key').setValue('8')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(wrapper.findAll('[data-testid="generated-image"]')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Some images could not be generated.')
  })

  it.each([
    ['rate limiting', 429, { error: { code: 'rate_limit_exceeded', message: 'raw upstream secret' } }, { 'Retry-After': '17' }, 'Too many requests. Try again in 17 seconds.'],
    ['insufficient balance', 402, { error: { code: 'insufficient_balance', message: 'raw upstream secret' } }, {}, 'Your balance is too low for this request.'],
    ['moderation rejection', 400, { error: { type: 'content_policy_violation', message: 'raw upstream secret' } }, {}, 'The request was rejected by content policy.'],
    ['invalid or revoked key', 401, { error: { code: 'invalid_api_key', message: 'Bearer sk-plaintext-secret' } }, {}, 'This API key is invalid or has been revoked.'],
    ['expired key', 403, { error: { code: 'API_KEY_EXPIRED', message: 'raw upstream secret' } }, {}, 'This API key is invalid or has been revoked.'],
    ['unknown failure', 503, { error: { code: 'upstream_failure', message: 'base64:super-secret-image' } }, {}, 'The request failed. Try again manually.'],
  ])('shows a deterministic safe state for %s', async (_name, status, body, headers, expected) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const clipboardWrite = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboardWrite } })
    const wrapper = await mountReadyStudio()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      ...body,
      request_id: 'req-safe-123',
      authorization: 'Bearer sk-plaintext-secret',
      image: 'base64:super-secret-image',
    }), { status, headers: { ...headers, 'X-Request-ID': 'req-safe-123' } }))

    await wrapper.get('textarea').setValue('Sensitive prompt body')
    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.text()).toContain(expected))
    expect(wrapper.text()).toContain('Request ID: req-safe-123')
    expect(wrapper.text()).not.toMatch(/raw upstream secret|sk-plaintext-secret|base64:super-secret-image|Sensitive prompt body/)
    expect(setItem).not.toHaveBeenCalled()
    expect(clipboardWrite).not.toHaveBeenCalled()
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('secret')
    expect(JSON.stringify(consoleWarn.mock.calls)).not.toContain('secret')
    const submissionCalls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/v1/images/generations'))
    expect(submissionCalls).toHaveLength(1)
  })

  it('accepts only one submission while a request is pending and never retries a failure', async () => {
    let resolveGeneration: (response: Response) => void = () => {}
    const generationResponse = new Promise<Response>((resolve) => { resolveGeneration = resolve })
    const wrapper = await mountReadyStudio()
    vi.mocked(fetch).mockReturnValueOnce(generationResponse)
    await wrapper.get('textarea').setValue('One request only')

    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    resolveGeneration(new Response('{}', { status: 503 }))
    await vi.waitFor(() => expect(wrapper.text()).toContain('The request failed. Try again manually.'))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })

  it('uses the same sanitized operational states for Edit and rejects unsafe request IDs', async () => {
    const wrapper = await mountReadyStudio()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    const input = wrapper.get('[data-testid="edit-file-input"]')
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new File(['source'], 'source.png', { type: 'image/png' })],
    })
    await input.trigger('change')
    await wrapper.get('[data-testid="edit-form"] textarea').setValue('Change the image')
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      request_id: 'sk-proj-unsafe-request-id',
      error: { code: 'moderation_blocked', message: 'raw rejected prompt and image' },
    }), { status: 400 }))

    await wrapper.get('[data-testid="edit-form"]').trigger('submit')

    await vi.waitFor(() => expect(wrapper.text()).toContain('The request was rejected by content policy.'))
    expect(wrapper.text()).not.toMatch(/Request ID|sk-unsafe|raw rejected/)
  })

  it('lets an in-flight response settle after disablement and blocks every later submission', async () => {
    let resolveGeneration: (response: Response) => void = () => {}
    const generationResponse = new Promise<Response>((resolve) => { resolveGeneration = resolve })
    const wrapper = await mountReadyStudio()
    vi.mocked(fetch).mockReturnValueOnce(generationResponse)
    appStore.fetchPublicSettings
      .mockResolvedValueOnce({ image_studio_enabled: true })
      .mockResolvedValueOnce({ image_studio_enabled: false })
    await wrapper.get('textarea').setValue('Finish this request')
    await wrapper.get('form').trigger('submit')

    appStore.cachedPublicSettings = { image_studio_enabled: false }
    resolveGeneration(new Response(JSON.stringify({ data: [{ b64_json: 'c2V0dGxlZA==' }] }), { status: 200 }))

    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="generated-image"]')).toHaveLength(1))
    expect(wrapper.text()).toContain('Image Studio has been disabled. New requests are blocked.')
    await wrapper.get('form').trigger('submit')
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['runtime disablement', { image_studio_enabled: false }],
    ['settings refresh failure', null],
  ])('force-refreshes the feature flag and blocks a new submission after %s', async (_case, settings) => {
    const wrapper = await mountReadyStudio()
    appStore.fetchPublicSettings.mockResolvedValueOnce(settings)
    await wrapper.get('textarea').setValue('Do not submit this')

    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.text()).toContain('Image Studio has been disabled. New requests are blocked.'))
    expect(appStore.fetchPublicSettings).toHaveBeenCalledWith(true)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('discovers runtime re-enablement on a later manual submission attempt', async () => {
    const wrapper = await mountReadyStudio()
    appStore.fetchPublicSettings
      .mockImplementationOnce(async () => {
        appStore.cachedPublicSettings = { image_studio_enabled: false }
        return appStore.cachedPublicSettings
      })
      .mockImplementationOnce(async () => {
        appStore.cachedPublicSettings = { image_studio_enabled: true }
        return appStore.cachedPublicSettings
      })
      .mockResolvedValueOnce({ image_studio_enabled: true })
    await wrapper.get('textarea').setValue('Submit after re-enable')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Image Studio has been disabled. New requests are blocked.'))

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ b64_json: 'cmUtZW5hYmxlZA==' }] }), { status: 200 }))
    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="generated-image"]')).toHaveLength(1))
    expect(wrapper.text()).not.toContain('Image Studio has been disabled. New requests are blocked.')
    const submissionCalls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/v1/images/generations'))
    expect(submissionCalls).toHaveLength(1)
  })

  it.each([
    ['invalid', 401, 'invalid_api_key'],
    ['expired', 403, 'API_KEY_EXPIRED'],
  ])('removes an %s selected key while retaining the localized failure', async (_kind, status, code) => {
    const wrapper = await mountReadyStudio()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      error: { code },
    }), { status }))
    await wrapper.get('textarea').setValue('Rejected key')

    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.text()).toContain('This API key is invalid or has been revoked.'))
    expect(wrapper.findAll('#image-studio-key option').map((option) => option.text())).not.toContain('Primary images (...1234)')
    expect((wrapper.get('#image-studio-key').element as HTMLSelectElement).value).toBe('8')
    expect(wrapper.text()).not.toContain('sk-first-1234')

    await vi.waitFor(() => expect(wrapper.find('[data-testid="model-select"]').exists()).toBe(true))
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ b64_json: 'bmV4dC1rZXk=' }] }), { status: 200 }))
    await wrapper.get('textarea').setValue('Use the next key')
    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="generated-image"]')).toHaveLength(1))
    const generationCalls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/v1/images/generations'))
    expect(generationCalls).toHaveLength(2)
    expect(generationCalls[1]?.[1]?.headers).toEqual({
      Authorization: 'Bearer sk-second-5678',
      'Content-Type': 'application/json',
    })
  })

  it('validates selected edit images against every server-authored upload limit', async () => {
    const wrapper = await mountReadyStudio()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')

    const input = wrapper.get('[data-testid="edit-file-input"]')
    const selectFiles = async (files: File[]) => {
      Object.defineProperty(input.element, 'files', { configurable: true, value: files })
      await input.trigger('change')
    }

    await selectFiles([new File(['gif'], 'source.gif', { type: 'image/gif' })])
    expect(wrapper.text()).toContain('This file type is not supported.')

    await selectFiles([
      new File(['a'], 'one.png', { type: 'image/png' }),
      new File(['b'], 'two.png', { type: 'image/png' }),
      new File(['c'], 'three.png', { type: 'image/png' }),
    ])
    expect(wrapper.text()).toContain('Too many images selected.')

    await selectFiles([new File(['123456789'], 'large.png', { type: 'image/png' })])
    expect(wrapper.text()).toContain('An image is too large.')

    await selectFiles([
      new File(['1234567'], 'one.png', { type: 'image/png' }),
      new File(['1234567'], 'two.png', { type: 'image/png' }),
    ])
    expect(wrapper.text()).toContain('The images are too large together.')
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('accepts dropped images and submits supported edit fields as multipart with the selected key', async () => {
    const wrapper = await mountReadyStudio()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')

    const source = new File(['source'], 'source.png', { type: 'image/png' })
    await wrapper.get('[data-testid="edit-drop-zone"]').trigger('drop', {
      dataTransfer: { files: [source] },
    })
    expect(wrapper.text()).toContain('source.png')

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      data: [{ b64_json: 'ZWRpdGVk' }],
    }), { status: 200 }))
    await wrapper.get('[data-testid="edit-form"] textarea').setValue('Make the sky blue')
    await wrapper.get('[data-testid="edit-form"]').trigger('submit')

    await vi.waitFor(() => expect(wrapper.findAll('[data-testid="edited-image"]')).toHaveLength(1))
    const editCall = vi.mocked(fetch).mock.calls[1]
    expect(new URL(String(editCall?.[0]), window.location.origin).pathname).toBe('/v1/images/edits')
    expect(editCall?.[1]?.headers).toEqual({ Authorization: 'Bearer sk-first-1234' })
    const body = editCall?.[1]?.body as FormData
    expect(body).toBeInstanceOf(FormData)
    expect(body.getAll('image')).toEqual([source])
    expect(body.get('model')).toBe('gpt-image-2')
    expect(body.get('prompt')).toBe('Make the sky blue')
    expect(body.get('size')).toBe('auto')
    expect(body.get('quality')).toBe('auto')
    expect(body.get('output_format')).toBe('png')
    expect(body.has('background')).toBe(false)
  })

  it('transfers a generated result into Edit as an in-memory file', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const wrapper = await mountReadyStudio()

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      data: [{ b64_json: 'aW1n' }],
    }), { status: 200 }))
    await wrapper.get('textarea').setValue('A source image')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="edit-result-0"]').exists()).toBe(true))

    await wrapper.get('[data-testid="edit-result-0"]').trigger('click')

    await vi.waitFor(() => expect(wrapper.findAll('[role="tab"]')[1].attributes('aria-selected')).toBe('true'))
    expect(wrapper.text()).toContain('image-studio-source.png')
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.objectContaining({
      name: 'image-studio-source.png',
      type: 'image/png',
    }))
    expect(setItem).not.toHaveBeenCalled()
  })

  it('downloads an individual result with a safe localized filename and success state', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const wrapper = await mountReadyStudio()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ b64_json: 'aW1n' }] }), { status: 200 }))
    await wrapper.get('textarea').setValue('A downloadable image')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="download-result-0"]').exists()).toBe(true))

    await wrapper.get('[data-testid="download-result-0"]').trigger('click')

    await vi.waitFor(() => expect(wrapper.text()).toContain('Download ready'))
    expect(click).toHaveBeenCalledOnce()
    const anchor = click.mock.instances[0]
    expect(anchor.download).toBe('image-studio-result-1.png')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:undefined')
  })

  it('shows preparing and failure states while downloading all results', async () => {
    let resolveRemote: (response: Response) => void = () => {}
    const remoteResponse = new Promise<Response>((resolve) => { resolveRemote = resolve })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const wrapper = await mountReadyStudio()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      data: [{ b64_json: 'aW1n' }, { url: 'https://images.example/two.png' }],
    }), { status: 200 }))
    await wrapper.get('textarea').setValue('Two downloadable images')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="download-all"]').exists()).toBe(true))
    vi.mocked(fetch).mockReturnValueOnce(remoteResponse)

    await wrapper.get('[data-testid="download-all"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Preparing download'))
    resolveRemote(new Response('remote', { status: 200, headers: { 'Content-Type': 'image/png' } }))
    await vi.waitFor(() => expect(wrapper.text()).toContain('Download ready'))
    expect(click).toHaveBeenCalledOnce()
    const zipBlob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)?.[0] as Blob
    expect(zipBlob.type).toBe('application/zip')
    const zipBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(reader.error)
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.readAsArrayBuffer(zipBlob)
    })
    const archive = unzipSync(new Uint8Array(zipBytes))
    expect(Object.keys(archive).sort()).toEqual(['image-studio-result-1.png', 'image-studio-result-2.png'])

    vi.mocked(fetch).mockRejectedValueOnce(new Error('secret upstream response'))
    await wrapper.get('[data-testid="download-all"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Download failed'))
    expect(wrapper.text()).not.toContain('secret upstream response')
  })

  it('prevents the selected key changing while an edit request settles', async () => {
    let resolveEdit: (response: Response) => void = () => {}
    const editResponse = new Promise<Response>((resolve) => { resolveEdit = resolve })
    const wrapper = await mountReadyStudio()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    const input = wrapper.get('[data-testid="edit-file-input"]')
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new File(['source'], 'source.png', { type: 'image/png' })],
    })
    await input.trigger('change')
    await wrapper.get('[data-testid="edit-form"] textarea').setValue('Change it')
    vi.mocked(fetch).mockReturnValueOnce(editResponse)
    await wrapper.get('[data-testid="edit-form"]').trigger('submit')

    await wrapper.findAll('[role="tab"]')[0].trigger('click')
    expect(wrapper.get('#image-studio-key').attributes('disabled')).toBeDefined()
    expect((wrapper.get('#image-studio-key').element as HTMLSelectElement).value).toBe('7')
    resolveEdit(new Response(JSON.stringify({ data: [{ b64_json: 'c3RhbGU=' }] }), { status: 200 }))

    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).not.toContain('Editing image'))
    expect(wrapper.findAll('[data-testid="edited-image"]')).toHaveLength(1)
  })

  it('keeps valid uploads on validation failure and revokes preview URLs on replacement and unmount', async () => {
    const wrapper = await mountReadyStudio()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    const input = wrapper.get('[data-testid="edit-file-input"]')
    const selectFiles = async (files: File[]) => {
      Object.defineProperty(input.element, 'files', { configurable: true, value: files })
      await input.trigger('change')
    }

    await selectFiles([new File(['one'], 'one.png', { type: 'image/png' })])
    await selectFiles([new File(['bad'], 'bad.gif', { type: 'image/gif' })])
    expect(wrapper.text()).toContain('one.png')
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:one.png')

    await selectFiles([new File(['two'], 'two.png', { type: 'image/png' })])
    expect(wrapper.text()).not.toContain('one.png')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:one.png')

    wrapper.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:two.png')
  })
})
