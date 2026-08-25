import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.argv[2]
const base = 'http://localhost:4175/#'
const pages = [
  ['dashboard', '/'],
  ['properties', '/properties'],
  ['property-detail', '/properties/p-01'],
  ['availability', '/availability'],
  ['clients', '/clients'],
  ['bookings', '/bookings'],
  ['payments', '/payments'],
  ['maintenance', '/maintenance'],
  ['notifications', '/notifications'],
  ['reports', '/reports'],
  ['settings', '/settings'],
]

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const errors = []

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${theme}] console: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[${theme}] pageerror: ${e.message}`))
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.evaluate((t) => localStorage.setItem('altier.theme', t), theme)
  for (const [name, path] of pages) {
    await page.goto(base + path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${OUT}/${theme}-${name}.png`, fullPage: false })
  }
  await ctx.close()
}

// mobile
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push(`[mobile] pageerror: ${e.message}`))
for (const [name, path] of [['dashboard', '/'], ['properties', '/properties'], ['availability', '/availability'], ['payments', '/payments']]) {
  await page.goto(base + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  if (overflow) errors.push(`[mobile] horizontal overflow on ${name}`)
  await page.screenshot({ path: `${OUT}/mobile-${name}.png`, fullPage: false })
}
await ctx.close()
await browser.close()
fs.writeFileSync(`${OUT}/errors.txt`, errors.join('\n') || 'none')
console.log(errors.length ? errors.join('\n') : 'NO ERRORS')
