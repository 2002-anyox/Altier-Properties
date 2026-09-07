/* ------------------------------------------------------------------ *
 * A day is a day, wherever you are
 *
 * iso() used to run a Date through toISOString(), which converts to UTC
 * first. Local midnight in Kampala is 21:00 the previous day in UTC, so
 * it returned yesterday's date for every user east of Greenwich — and
 * this is a product built for Uganda. The 28th read as "tomorrow" all
 * through the 28th, and every "overdue by 3 days" meant four.
 *
 * Nothing caught it because every machine that ran the checks was on UTC,
 * where the bug is invisible. So this runs the date helpers under a
 * spread of real timezones — two ahead of UTC, two behind, one on it —
 * and asserts they agree with the calendar a person there would be
 * looking at.
 *
 *   npm run check:dates
 * ------------------------------------------------------------------ */

import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'

const ZONES = [
  'UTC',
  'Africa/Kampala',    // +3, the one this is for
  'Asia/Tokyo',        // +9, far enough to cross a day for most of ours
  'Pacific/Kiritimati', // +14, the furthest ahead there is
  'America/New_York',  // -4/-5
  'Pacific/Niue',      // -11, the furthest behind
]

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

/* Run in a child process per zone: TZ is read once when the process
   starts, so setting it in this one would change nothing. */
const probe = `
  import { TODAY, iso, dayOffset, daysBetween, dayIn } from '../src/lib/dates.js'
  import { relativeDay } from '../src/lib/format.js'
  const local = new Date().toLocaleDateString('en-CA')
  console.log(JSON.stringify({
    local,
    today: iso(TODAY),
    tomorrow: dayOffset(1),
    yesterday: dayOffset(-1),
    gapToLocal: daysBetween(iso(TODAY), local),
    saysAboutToday: relativeDay(local),
    inKampala: dayIn('Africa/Kampala'),
  }))
`

writeFileSync('scripts/.date-probe.ts', probe)
try {
  execFileSync('npx', ['esbuild', 'scripts/.date-probe.ts', '--bundle', '--platform=node',
    '--format=esm', '--outfile=node_modules/.cache/date-probe.mjs', '--log-level=error'],
    { stdio: ['ignore', 'inherit', 'inherit'] })
} finally {
  rmSync('scripts/.date-probe.ts', { force: true })
}

console.log('')
for (const zone of ZONES) {
  const raw = execFileSync('node', ['node_modules/.cache/date-probe.mjs'],
    { env: { ...process.env, TZ: zone }, encoding: 'utf8' })
  const r = JSON.parse(raw)

  check(`${zone.padEnd(20)} today is today`, r.today === r.local, `${r.today} vs ${r.local}`)
  check(`${' '.repeat(20)} and reads as "today"`, r.saysAboutToday === 'today', r.saysAboutToday)
  check(`${' '.repeat(20)} tomorrow is one day on`,
    r.gapToLocal === 0 && r.tomorrow > r.today && r.yesterday < r.today,
    `${r.yesterday} < ${r.today} < ${r.tomorrow}`)
}

console.log(failures === 0 ? '\nDATES CLEAN\n' : `\n${failures} DATE CHECK(S) FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
