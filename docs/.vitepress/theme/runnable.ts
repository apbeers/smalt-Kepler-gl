// Runnable examples in the browser: each ```js run block gets a live map. The code runs as the body of an async
// function with the map and smaltgl's API in scope (see SCOPE), so examples read like app code without imports.
// smaltdb and smaltcy load only when an example names them.
import type { SmaltMap, Basemap } from '@smaltworks/smaltgl'

/** Live maps at once: each holds a GPU device. Older ones are put to sleep. */
const MAX_MAPS = 3

const live: { el: HTMLElement; map: SmaltMap }[] = []
const isDark = () => document.documentElement.classList.contains('dark')

/** What example code can use. */
async function scope(code: string): Promise<Record<string, unknown>> {
  const gl = await import('@smaltworks/smaltgl')
  const ds = await import('@smaltworks/smaltgl/datasets')
  const s: Record<string, unknown> = { ...gl, generate: ds.generate, supplyChain: ds.supplyChain }
  if (/\bsmaltdb\b/.test(code)) s.smaltdb = await import('smaltdb')
  if (/\bsmaltcy\b/.test(code)) s.smaltcy = await import('@smaltworks/smaltcy')
  return s
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>

export function enableRunnable(doc: Document = document): void {
  const w = doc as Document & { glRun?: boolean }
  if (w.glRun) return
  w.glRun = true
  // For the browser tests: stop every example's map (animating ones keep a software GPU busy).
  ;(window as unknown as { glRunStopAll: () => void }).glRunStopAll = () => {
    for (const l of live.splice(0)) l.map.destroy()
  }

  const parts = (ex: HTMLElement) => ({
    code: ex.querySelector<HTMLElement>(':scope > .gl-run-code')!,
    mapEl: ex.querySelector<HTMLElement>(':scope > .gl-run-map')!,
    status: ex.querySelector<HTMLElement>('.gl-run-status')!,
    reset: ex.querySelector<HTMLElement>('[data-run="reset"]')!,
  })
  const original = (ex: HTMLElement) => (ex.getAttribute('data-code') ?? '').replace(/\n+$/, '')
  const editor = (ex: HTMLElement) => ex.querySelector<HTMLTextAreaElement>('.gl-run-editor')
  const current = (ex: HTMLElement) => editor(ex)?.value ?? original(ex)
  const say = (ex: HTMLElement, text: string) => (parts(ex).status.textContent = text)

  const edit = (ex: HTMLElement): HTMLTextAreaElement => {
    const have = editor(ex)
    if (have) return have
    const { code, reset } = parts(ex)
    const ta = doc.createElement('textarea')
    ta.className = 'gl-run-editor'
    ta.spellcheck = false
    ta.value = original(ex)
    ta.rows = Math.max(4, ta.value.split('\n').length + 1)
    ta.setAttribute('aria-label', 'Example code')
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        void run(ex)
      }
    })
    code.hidden = true
    code.after(ta)
    reset.hidden = false
    ta.focus()
    return ta
  }

  const mapFor = async (ex: HTMLElement): Promise<SmaltMap> => {
    const have = live.find((l) => l.el === ex)
    if (have) return have.map
    while (live.length >= MAX_MAPS) {
      const old = live.shift()!
      old.map.destroy()
      parts(old.el).mapEl.hidden = true
      say(old.el, 'Paused: run it again to redraw')
    }
    const { mapEl } = parts(ex)
    mapEl.hidden = false
    mapEl.style.height = `${ex.getAttribute('data-height') ?? 380}px`
    const gl = await import('@smaltworks/smaltgl')
    const theme = ex.getAttribute('data-theme')
    const map = await gl.createMap(mapEl, {
      basemap: theme === 'none' ? null : gl.basemap({ theme: theme === 'dark' || (theme === 'auto' && isDark()) ? 'dark' : 'light' }),
    })
    live.push({ el: ex, map })
    let last = 0
    map.on('frame', (s) => {
      const now = performance.now()
      if (now - last < 250) return
      last = now
      const gpu = s.gpuMs !== undefined ? ` · GPU ${s.gpuMs.toFixed(1)} ms` : ''
      if (!ex.hasAttribute('aria-busy')) say(ex, `${s.objects.toLocaleString('en-US')} objects · frame ${s.cpuMs.toFixed(1)} ms CPU${gpu}`)
    })
    return map
  }

  const run = async (ex: HTMLElement): Promise<void> => {
    ex.setAttribute('aria-busy', 'true')
    say(ex, 'Running…')
    try {
      const map = await mapFor(ex)
      map.setLayers([])
      const code = current(ex)
      const s = await scope(code)
      s.map = map
      const names = Object.keys(s).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k))
      const t0 = performance.now()
      await new AsyncFunction(...names, code)(...names.map((k) => s[k]))
      await map.renderNow()
      say(ex, `Ran in ${(performance.now() - t0).toFixed(0)} ms`)
      ex.setAttribute('data-ran', String(Number(ex.getAttribute('data-ran') ?? 0) + 1))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      say(ex, `Error: ${msg}`)
      ex.setAttribute('data-error', msg)
      if ((e as Error)?.name === 'GpuUnavailableError') {
        const { mapEl } = parts(ex)
        mapEl.hidden = false
        mapEl.innerHTML = `<p class="gl-run-note">This example needs WebGPU: Chrome or Edge 113+, Safari 26+, or Firefox 141+ on Windows.</p>`
      }
    } finally {
      ex.removeAttribute('aria-busy')
    }
  }

  doc.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-run]')
    const ex = b?.closest<HTMLElement>('.gl-run')
    if (!b || !ex) return
    const what = b.getAttribute('data-run')
    if (what === 'run') void run(ex)
    else if (what === 'edit') edit(ex)
    else if (what === 'reset') {
      editor(ex)?.remove()
      parts(ex).code.hidden = false
      parts(ex).reset.hidden = true
    } else if (what === 'copy') void navigator.clipboard?.writeText(current(ex)).then(() => say(ex, 'Copied'))
  })

  // Follow the site's light and dark switch.
  new MutationObserver(() => {
    for (const { el, map } of live) {
      if (el.getAttribute('data-theme') !== 'auto') continue
      const bm = map.getBasemap() as Basemap | null
      if (!bm) continue
      bm.setTheme(isDark() ? 'dark' : 'light')
      map.setBasemap(bm)
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
}
