import { expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { extname, resolve } from 'node:path'

// MGR-PWA-004: exercise the actual generated worker, precache, and update client.
// Run after `VITE_API_URL="" pnpm --filter web build`.
test('an already-open PWA automatically loads a new release without clearing its cache', async ({ page }, testInfo) => {
  let release = 'first'
  let fieldReads = 0
  const dist = fileURLToPath(new URL('../dist/', import.meta.url))
  const contentTypes: Record<string, string> = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
    '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json',
  }
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
      if (pathname === '/fields') {
        fieldReads += 1
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        response.end('[]')
        return
      }
      // This test needs only the empty public view; no backend or production writes.
      if (pathname.startsWith('/socket.io/')) { response.writeHead(404).end(); return }
      const filename = pathname === '/line' || pathname === '/' ? '/index.html' : pathname
      const path = resolve(dist, `.${filename}`)
      if (!path.startsWith(dist)) { response.writeHead(404).end(); return }
      let content = await readFile(path)
      if (filename === '/index.html') {
        content = Buffer.from(content.toString().replace('<html ', `<html data-release="${release}" `))
      }
      if (filename === '/sw.js') {
        content = Buffer.from(content.toString().replace(
          /url:"index.html",revision:"[^"]+"/,
          `url:"index.html",revision:"${release}"`,
        ))
      }
      response.writeHead(200, {
        'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      })
      response.end(content)
    })().catch(() => { response.writeHead(404).end() })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing test server port')
  const url = `http://127.0.0.1:${address.port}/line`
  try {
    await page.goto(url)
    await expect(page.locator('html')).toHaveAttribute('data-release', 'first')
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    const readsBeforeUpdate = fieldReads
    release = 'second'
    // Resuming after reconnect must check even if the app has stayed open.
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.locator('html')).toHaveAttribute('data-release', 'second', { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'התור במגרש', exact: true })).toBeVisible()
    await expect.poll(() => fieldReads).toBeGreaterThan(readsBeforeUpdate)
    // A first install and an applied update must both settle without reload loops.
    await page.screenshot({ path: testInfo.outputPath('updated-pwa.png') })
    await expect(page.locator('html')).toHaveAttribute('data-release', 'second')
  } finally {
    await page.close()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
