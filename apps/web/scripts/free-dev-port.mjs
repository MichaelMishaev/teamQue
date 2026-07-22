/**
 * Kill whatever is listening on the Vite port so `pnpm dev` always binds
 * to the configured port instead of silently bumping (or failing under
 * strictPort).
 */
import { execFileSync } from 'node:child_process'

const port = process.argv[2]
if (!port || !/^\d+$/.test(port)) {
  console.error('usage: free-dev-port.mjs <port>')
  process.exit(1)
}

try {
  const pids = execFileSync(
    'lsof',
    ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGKILL')
      console.log(`freed :${port} (killed pid ${pid})`)
    } catch {
      // Process already gone — fine.
    }
  }
} catch {
  // lsof exits non-zero when nothing is listening — fine.
}
