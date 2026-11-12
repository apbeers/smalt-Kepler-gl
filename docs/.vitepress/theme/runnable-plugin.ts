// The markdown side of runnable examples (runnable.ts is the browser side). A ```js run fence becomes the code, a
// toolbar (Run, Edit, Reset, Copy) and an empty map. At rest it loads nothing; Run starts the map and runs the code.
// Flags after `run`: `dark` starts the map on the dark basemap, `nobasemap` on a blank one, `height=480` sets the
// map's height in pixels.
//
// test/browser/docs.mjs runs every example on the built site.

interface Token {
  type: string
  info: string
  content: string
}
interface MarkdownIt {
  core: { ruler: { push(name: string, rule: (state: { tokens: Token[]; Token: new (type: string, tag: string, nesting: number) => Token }) => void): void } }
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function runnablePlugin(md: MarkdownIt): void {
  md.core.ruler.push('gl_runnable', (state) => {
    const out: Token[] = []
    const html = (content: string): Token => {
      const t = new state.Token('html_block', '', 0)
      t.content = content
      return t
    }
    for (const t of state.tokens) {
      const [lang, ...flags] = t.type === 'fence' ? t.info.trim().split(/\s+/) : ['']
      if (lang !== 'js' || !flags.includes('run')) {
        out.push(t)
        continue
      }
      t.info = 'js'
      const theme = flags.includes('dark') ? 'dark' : flags.includes('nobasemap') ? 'none' : 'auto'
      const height = Number(flags.find((f) => f.startsWith('height='))?.slice(7) ?? 380)
      out.push(html(`<div class="gl-run" data-theme="${theme}" data-height="${height}" data-code="${esc(t.content)}" v-pre>\n<div class="gl-run-code">\n`))
      out.push(t)
      out.push(
        html(
          `</div>\n<div class="gl-run-bar" role="toolbar" aria-label="Example">` +
            `<button type="button" class="gl-run-go" data-run="run" title="Run (Ctrl+Enter)">Run</button>` +
            `<button type="button" data-run="edit">Edit</button>` +
            `<button type="button" data-run="reset" hidden>Reset</button>` +
            `<button type="button" data-run="copy">Copy</button>` +
            `<span class="gl-run-status" role="status" aria-live="polite"></span></div>\n` +
            `<div class="gl-run-map" hidden></div>\n</div>\n`,
        ),
      )
    }
    state.tokens = out
  })
}
