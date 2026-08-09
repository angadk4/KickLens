import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Preload the two font faces that first paint actually needs.
 *
 * Without this the discovery chain is HTML -> 66 KB CSS -> woff2: three serial round trips, and
 * the 131 KB display face cannot even start downloading until the stylesheet has parsed. That
 * delay is what forces the re-layout TopNav.tsx documents ("the display face loads after first
 * paint and widens the rail by ~70px").
 *
 * Latin subsets ONLY. The vietnamese / cyrillic / latin-ext faces are unicode-range gated and
 * are never fetched for this content, so preloading them would be pure waste on the critical
 * path. Two files, not four: the display face and the mono weight the body copy uses. The 500
 * and 600 mono weights are chips and labels, below the fold of the first paint.
 *
 * `crossorigin` is mandatory on a font preload — without it the browser discards the preload
 * and fetches the file a second time. CSP already allows font-src 'self'.
 *
 * Written as a plugin rather than by hand in index.html because the filenames carry content
 * hashes: a hand-written tag would silently rot on the next font bump, and a preload pointing
 * at a file that no longer exists is worse than no preload at all.
 */
function preloadCriticalFonts(): Plugin {
  const WANTED = [/^bricolage-grotesque-latin-standard-normal/, /^ibm-plex-mono-latin-400-normal/]
  return {
    name: 'kicklens:preload-critical-fonts',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      // the emitted bundle is handed to this hook in build mode, so the content-hashed
      // filenames are read from the real output rather than guessed
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {})
        const hrefs = files
          .filter((f) => f.endsWith('.woff2'))
          .filter((f) => WANTED.some((re) => re.test(f.replace(/^assets\//, ''))))
          .map((f) => '/' + f)
          .sort()
        if (hrefs.length !== WANTED.length) {
          // a renamed font package would otherwise silently ship zero preloads
          this.warn(
            `preload-critical-fonts matched ${hrefs.length} of ${WANTED.length} faces — check the filename patterns`,
          )
        }
        return hrefs.map((href) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href },
          injectTo: 'head-prepend' as const,
        }))
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), preloadCriticalFonts()],
  // local-only: lets headless-Chrome-in-Docker reach `vite preview` for screenshot QA
  preview: { allowedHosts: ['host.docker.internal'] },
})
