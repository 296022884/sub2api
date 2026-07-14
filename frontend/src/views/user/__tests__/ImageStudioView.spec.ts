import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImageStudioView from '../ImageStudioView.vue'

const { listKeys } = vi.hoisted(() => ({ listKeys: vi.fn() }))

vi.mock('@/api/keys', () => ({ keysAPI: { list: listKeys } }))

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => ({
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
    })[key] ?? key,
  }),
}))

describe('Image Studio workspace shell', () => {
  beforeEach(() => {
    listKeys.mockResolvedValue({
      items: [
        {
          id: 7,
          key: 'sk-first-1234',
          name: 'Primary images',
          status: 'active',
          group: { platform: 'openai', allow_image_generation: true },
        },
        {
          id: 8,
          key: 'sk-second-5678',
          name: 'Backup images',
          status: 'active',
          group: { platform: 'openai', allow_image_generation: true },
        },
      ],
      pages: 1,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      operations: ['generate'],
      models: [{
        id: 'gpt-image-2',
        operations: ['generate'],
        parameters: {
          size: { values: ['auto', '1024x1024'], default: 'auto' },
          quality: { values: ['auto', 'high'], default: 'auto' },
          output_format: { values: ['png', 'webp'], default: 'png' },
          n: { min: 1, max: 2, default: 1 },
        },
      }],
      uploads: { mime_types: [], max_files: 0, max_file_bytes: 0, max_total_bytes: 0 },
    }), { status: 200 })))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('shows only Generate and Edit and selects Generate by default', async () => {
    const wrapper = mount(ImageStudioView, {
      global: { stubs: { AppLayout: { template: '<div><slot /></div>' } } },
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map((tab) => tab.text())).toEqual(['Generate', 'Edit'])
    expect(tabs[0].attributes('aria-selected')).toBe('true')

    await tabs[1].trigger('click')
    expect(wrapper.get('[role="tabpanel"]').text()).toContain('Edit description')
  })

  it('selects the first eligible key and renders only server-authored controls', async () => {
    const wrapper = mount(ImageStudioView, {
      global: { stubs: { AppLayout: { template: '<div><slot /></div>' } } },
    })

    await vi.waitFor(() => expect(wrapper.find('[data-testid="model-select"]').exists()).toBe(true))

    expect(wrapper.text()).toContain('Primary images')
    expect(wrapper.text()).toContain('...1234')
    expect(wrapper.text()).not.toContain('sk-first-1234')
    expect((wrapper.get('[data-testid="model-select"]').element as HTMLSelectElement).value).toBe('gpt-image-2')
    expect(wrapper.find('[data-testid="size-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="quality-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="background-select"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="output-format-select"]').exists()).toBe(true)
  })

  it('submits only supported fields with the selected key and renders base64 and URL images', async () => {
    const wrapper = mount(ImageStudioView, {
      global: { stubs: { AppLayout: { template: '<div><slot /></div>' } } },
    })
    await vi.waitFor(() => expect(wrapper.find('[data-testid="model-select"]').exists()).toBe(true))

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
    expect(new URL(String(generationCall?.[0])).pathname).toBe('/v1/images/generations')
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
      n: 1,
    })
    expect(wrapper.findAll('[data-testid="generated-image"]')[0].attributes('src')).toBe('data:image/png;base64,aW1hZ2UtYnl0ZXM=')
    expect(wrapper.findAll('[data-testid="generated-image"]')[1].attributes('src')).toBe('https://images.example/result.png')
  })

  it('keeps successful images from a partial response and clears them when the key changes', async () => {
    const wrapper = mount(ImageStudioView, {
      global: { stubs: { AppLayout: { template: '<div><slot /></div>' } } },
    })
    await vi.waitFor(() => expect(wrapper.find('[data-testid="model-select"]').exists()).toBe(true))

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
})
