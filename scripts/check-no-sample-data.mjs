/* ------------------------------------------------------------------ *
 * Nothing invented ships
 *
 * The sample portfolio used to live under src/, imported by the store so
 * that a build with no server had something to draw. It was removed, and
 * this is what stops it coming back: the check greps the built bundle for
 * names that only exist in the fixture, and fails if it finds any.
 *
 * It also refuses an import from src/ into the fixture directory, which
 * is the way it would return — one convenient import, and every browser
 * downloads twenty-four properties belonging to nobody.
 *
 *   npm run check:nodata     (run after npm run build)
 * ------------------------------------------------------------------ */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

/* Strings that appear in the fixture and nowhere a real deployment would
   put them. Deliberately specific: a false alarm on the word "Kampala"
   would train somebody to ignore this. */
const INVENTED = [
  /* People and places that exist only in the fixture. The reference
     prefixes ALT-INV- and MNT- are deliberately not here: those are the
     product's own numbering, and new records get them too. */
  'Nakato Ssemakula', 'Brian Kizito', 'Aisha Namutebi', 'Ronald Okello',
  'Patience Akello', 'Sarah Nabbosa', 'Tendo Wasswa',
  'Miriam Nakabugo', 'David Ssentongo', 'Grace Atim',
  'Kololo Terrace', 'Nakasero Hill Residence', 'Muyenga Serviced',
  'Bugolobi Serviced', 'Lubowa Ridge', 'Kira Residence',
  'altier.co.ug', 'mail.example.com',
]

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? walk(path) : [path]
})

/* 1. The built bundle. */
let bundle = ''
try {
  const files = walk('dist').filter((f) => /\.(js|css|html)$/.test(f))
  check('a build is present to examine', files.length > 0, `${files.length} files`)
  bundle = files.map((f) => readFileSync(f, 'utf8')).join('\n')
} catch {
  console.error('check:nodata needs a build — run npm run build first.')
  process.exit(1)
}

const found = INVENTED.filter((needle) => bundle.includes(needle))
check('no invented person, property or reference in the bundle',
  found.length === 0, found.length ? found.join(', ') : `${INVENTED.length} strings looked for`)

/* 2. The source tree, so it cannot creep back in before the next build. */
const sources = walk('src').filter((f) => /\.(ts|tsx)$/.test(f))
const offenders = sources.filter((f) => {
  const text = readFileSync(f, 'utf8')
  return INVENTED.some((needle) => text.includes(needle))
})
check('nothing under src/ carries one either',
  offenders.length === 0, offenders.join(', ') || `${sources.length} files scanned`)

/* 3. The fixture stays a leaf: src/ may not import it. */
const importers = sources.filter((f) => /scripts\/fixture|fixture\/portfolio/.test(readFileSync(f, 'utf8')))
check('and no file under src/ imports the fixture',
  importers.length === 0, importers.join(', ') || 'none')

console.log(failures === 0 ? '\nNO SAMPLE DATA IN THE BUILD\n' : `\n${failures} CHECK(S) FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
