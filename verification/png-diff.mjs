import sharp from 'sharp'

const [a, b] = process.argv.slice(2)
const toRaw = f => sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

const [A, B] = await Promise.all([toRaw(a), toRaw(b)])
const { width, height } = A.info
let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    if (A.data[i] !== B.data[i] || A.data[i+1] !== B.data[i+1] || A.data[i+2] !== B.data[i+2]) {
      n++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}

console.log(JSON.stringify({
  size: `${width}x${height}`,
  differingPixels: n,
  percent: +(100 * n / (width * height)).toFixed(4),
  bbox: n ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null,
}))
