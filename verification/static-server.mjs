import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'

const root = resolve(process.argv[2] ?? 'out')
const port = Number(process.argv[3] ?? 4190)
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.png': 'image/png', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
}

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (p.endsWith('/')) p += 'index.html'
    const file = resolve(join(root, p))
    if (file !== root && !file.startsWith(root + sep)) throw new Error('outside root')
    const data = await readFile(file)
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      // Mirrors the production header set in vercel.json (Next's own headers()
      // config isn't available under output: 'export'), so embed-mode CSP
      // behaviour can be verified against this local server too.
      'Content-Security-Policy': "frame-ancestors 'self' https://jordworld.com https://*.jordworld.com",
    })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
}).listen(port, () => console.log('listening on ' + port))
