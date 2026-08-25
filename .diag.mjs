import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const paths = ['/', '/properties', '/properties/p-01', '/availability', '/clients', '/clients/c-01', '/bookings', '/payments', '/maintenance', '/notifications', '/reports', '/settings']
const sizes = [{ w: 390, m: true }, { w: 768, m: false }, { w: 1280, m: false }]
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: 900 }, isMobile: s.m, hasTouch: s.m })
  const page = await ctx.newPage()
  const bad = []
  for (const path of paths) {
    await page.goto('http://localhost:4175/#' + path)
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(600)
    const r = await page.evaluate(() => {
      const cw = document.documentElement.clientWidth
      const off = []
      document.querySelectorAll('body *').forEach((el) => {
        const rect = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        if (rect.right > cw + 1 && !['auto', 'scroll', 'hidden'].includes(cs.overflowX) && !el.closest('.scroll-x') && cs.position !== 'fixed')
          off.push(el.tagName + '.' + String(el.className).slice(0, 55))
      })
      return { sw: document.documentElement.scrollWidth, cw, off: [...new Set(off)].slice(0, 3) }
    })
    if (r.sw > r.cw + 1) bad.push(`${path} (${r.sw}/${r.cw}) ${r.off.join(' ; ')}`)
  }
  console.log(`--- ${s.w}px: ` + (bad.length ? '\n  ' + bad.join('\n  ') : 'clean'))
  await ctx.close()
}
await browser.close()
