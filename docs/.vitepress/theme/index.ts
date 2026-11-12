import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { defineAsyncComponent, h, type FunctionalComponent } from 'vue'
import './smaltdb.css'
import './smaltgl.css'
import { withSmaltworks } from './stage'
import { enableRunnable } from './runnable'

/** The wordmark: sm·alt·gl in Martian Mono, alt in smalt, until smaltgl has outlined logo files (ADR 0001). */
const wordmark = (cls = 'gl-wordmark') => h('span', { class: cls }, ['sm', h('span', { class: 'alt' }, 'alt'), 'gl'])

const WithWordmark: FunctionalComponent = (_props, { slots }) =>
  h(DefaultTheme.Layout, null, { ...slots, 'nav-bar-title-before': () => wordmark() })

export default {
  extends: DefaultTheme,
  Layout: withSmaltworks({ Layout: WithWordmark }),
  enhanceApp({ app }) {
    if (typeof document !== 'undefined') enableRunnable()
    // The demo loads only on its page: it pulls in the generators, smaltdb and smaltcy.
    app.component('TechDemo', defineAsyncComponent(() => import('./components/TechDemo.vue')))
    app.component('HeroMap', defineAsyncComponent(() => import('./components/HeroMap.vue')))
    app.component('Wordmark', () => wordmark('gl-wordmark gl-wordmark-hero'))
  },
} satisfies Theme
