import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ImageStudioView from '../ImageStudioView.vue'

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => ({
      'imageStudio.title': 'Image Studio',
      'imageStudio.tabs.generate': 'Generate',
      'imageStudio.tabs.edit': 'Edit',
      'imageStudio.generateDescription': 'Generate description',
      'imageStudio.editDescription': 'Edit description',
    })[key] ?? key,
  }),
}))

describe('Image Studio workspace shell', () => {
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
})
