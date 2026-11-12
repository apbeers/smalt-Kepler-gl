import { defineConfig } from 'vitepress'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { smaltLight, smaltDark } from './theme/shiki'
import { smaltworksMenu, smaltworksFooter } from './theme/smaltworks'
import { runnablePlugin } from './theme/runnable-plugin'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = 'https://github.com/apbeers/smalt-Kepler-gl'
// GitHub Pages serves the site under the repository's name.
const BASE = process.env.SMALTGL_BASE ?? '/smalt-Kepler-gl/'

export default defineConfig({
  title: 'smaltgl',
  description: 'Maps for smaltdb, in the browser: location data drawn on the GPU with WebGPU.',
  base: BASE,
  cleanUrls: true,
  rewrites: { 'adr/README.md': 'adr/index.md' },
  lastUpdated: false,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${BASE}favicon.svg` }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Geist+Mono:wght@400;500&family=Martian+Mono:wght@400;600&display=swap' }],
  ],
  vite: {
    resolve: {
      alias: [
        { find: /^@smaltworks\/smaltgl$/, replacement: path.resolve(here, '../../src/index.ts') },
        { find: /^@smaltworks\/smaltgl\/(.*)$/, replacement: path.resolve(here, '../../src/$1/index.ts') },
        // smaltcy is pinned to a commit of its repository, which ships its TypeScript source.
        { find: /^@smaltworks\/smaltcy$/, replacement: path.resolve(here, '../../node_modules/@smaltworks/smaltcy/src/index.ts') },
      ],
    },
    // smaltdb starts its worker with new URL('./smaltdb-worker.js', import.meta.url): keep it out of pre-bundling.
    optimizeDeps: { exclude: ['smaltdb'] },
    worker: { format: 'es' },
    build: { chunkSizeWarningLimit: 2000 },
  },
  markdown: {
    theme: { light: smaltLight, dark: smaltDark },
    config(md) {
      // Every ```js run example runs where it stands, on a live map (theme/runnable.ts).
      md.use(runnablePlugin)
      // Links that leave docs/ point at the file on GitHub.
      const fallback = md.renderer.rules.link_open ?? ((t, i, o, _e, s) => s.renderToken(t, i, o))
      md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const href = tokens[idx].attrGet('href')
        if (href && !/^[a-z]+:|^#|^\//i.test(href) && env?.relativePath) {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(env.relativePath), href))
          if (target.startsWith('../')) {
            tokens[idx].attrSet('href', `${REPO}/blob/HEAD/${target.slice(3)}`)
            tokens[idx].attrSet('target', '_blank')
            tokens[idx].attrSet('rel', 'noreferrer')
          }
        }
        return fallback(tokens, idx, options, env, self)
      }
    },
  },
  themeConfig: {
    siteTitle: false,
    nav: [
      { text: 'Tech demo', link: '/demo' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Layers', link: '/guide/layers' },
      { text: 'API', link: '/reference/api' },
      {
        text: 'Internals',
        items: [
          { text: 'Architecture', link: '/architecture' },
          { text: 'Performance', link: '/guide/performance' },
          { text: 'Decisions', link: '/adr/' },
        ],
      },
      smaltworksMenu(),
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Layers', link: '/guide/layers' },
          { text: 'Filters and time', link: '/guide/filters' },
          { text: 'Data from smaltdb', link: '/guide/smaltdb' },
          { text: 'Data from smaltcy', link: '/guide/smaltcy' },
          { text: 'Sample data', link: '/guide/sample-data' },
          { text: 'The basemap', link: '/guide/basemap' },
          { text: 'Performance', link: '/guide/performance' },
          { text: 'Tech demo', link: '/demo' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'API', link: '/reference/api' },
          { text: 'Architecture', link: '/architecture' },
        ],
      },
      {
        text: 'Internals',
        collapsed: true,
        items: [
          { text: 'Decisions', link: '/adr/' },
          { text: '0001 smaltgl', link: '/adr/0001-smaltgl' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: REPO }],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    footer: smaltworksFooter(BASE),
  },
})
