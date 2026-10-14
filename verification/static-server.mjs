import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

const root = resolve(process.argv[2] ?? 'out')
const port = Number(process.argv[3] ?? 4190)
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.png': 'image/png', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
}
// Compressible by content type — binary formats like PNG gain nothing from gzip.
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest', '.txt'])

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (p.endsWith('/')) p += 'index.html'
    const file = resolve(join(root, p))
    if (file !== root && !file.startsWith(root + sep)) throw new Error('outside root')
    let data = await readFile(file)
    const headers = {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      // Mirrors the production header set in vercel.json (Next's own headers()
      // config isn't available under output: 'export'), so embed-mode CSP
      // behaviour can be verified against this local server too.
      'Content-Security-Policy': "frame-ancestors 'self' https://jordworld.com https://*.jordworld.com",
    }
    // Vercel compresses every response in production; serving these assets
    // uncompressed here would make local Lighthouse/perf numbers artificially
    // pessimistic relative to what the deployed site actually does.
    if (COMPRESSIBLE.has(extname(file)) && (req.headers['accept-encoding'] ?? '').includes('gzip')) {
      data = gzipSync(data)
      headers['Content-Encoding'] = 'gzip'
    }
    res.writeHead(200, headers)
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
}).listen(port, () => console.log('listening on ' + port))
