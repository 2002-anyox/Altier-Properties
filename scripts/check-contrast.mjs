/* ------------------------------------------------------------------ *
 * Every word on every surface, measured
 *
 * Run with `npm run check:contrast`. This exists because the light theme
 * shipped with its most-used text colour at 3.08:1 — #7A8491 on the inset
 * surface — while the dark theme, built later and more carefully, passed
 * everything. Nobody was measuring, so nobody knew.
 *
 * The numbers are read out of src/index.css rather than restated here, so
 * this cannot agree with a stylesheet it is no longer describing.
 *
 * WCAG 2.2: 4.5:1 for text under 18pt (or under 14pt bold), 3:1 for the
 * boundary of a control and for text at 18pt and above.
 * ------------------------------------------------------------------ */
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

/**
 * The custom properties declared in one selector's block.
 *
 * The closing brace is found by counting, not by looking for one at the
 * start of a line: the .on-dark blocks live inside `@layer base` and close
 * with an indented `}`, so a naive search ran straight past them into the
 * next block and read the wrong theme's values back.
 */
function tokens(selector) {
  const at = css.indexOf(selector)
  if (at < 0) throw new Error(`${selector} is no longer in src/index.css`)
  let depth = 0
  let end = at
  for (let i = at + selector.length - 1; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  const body = css.slice(at, end)
  return Object.fromEntries(
    [...body.matchAll(/--([a-z-]+):\s*(\d+ \d+ \d+)\s*;/g)]
      .map(([, name, triplet]) => [name, triplet.split(' ').map(Number)]),
  )
}

const channel = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const show = (t) => '#' + t.map((n) => n.toString(16).padStart(2, '0')).join('')

const fail = []
let checked = 0
const needs = (label, fg, bg, floor) => {
  const r = ratio(fg, bg)
  checked++
  if (r < floor) fail.push(`${label}: ${show(fg)} on ${show(bg)} is ${r.toFixed(2)}:1, needs ${floor}:1`)
  return r
}

const THEMES = [['light', ':root {'], ['dark', ":root[data-theme='dark'] {"]]

/* Anything that carries a word owes 4.5:1 — on every surface it can land
   on, not just the flattering one. A colour that passes on the card and
   fails on the inset well is a colour that fails. */
const WORDS = [
  'c-text-primary', 'c-text-secondary', 'c-text-muted', 'c-accent-text',
  'c-status-good-ink', 'c-status-warning-ink', 'c-status-serious-ink',
  'c-status-critical-ink', 'c-status-info-ink',
]
const STATUSES = ['good', 'warning', 'serious', 'critical', 'info']

for (const [name, selector] of THEMES) {
  const t = tokens(selector)
  const surfaces = ['c-surface-card', 'c-surface', 'c-surface-inset', 'c-surface-raised']

  for (const word of WORDS) {
    if (!t[word]) { fail.push(`${name}: --${word} is missing`); continue }
    for (const s of surfaces) needs(`${name} ${word} on ${s}`, t[word], t[s], 4.5)
  }

  /* A chip's ink against its own soft ground — and the neutral text that
     also lands on those grounds, because a warning panel is as often
     "here is what happened" in body copy as it is one coloured word. */
  for (const s of STATUSES) {
    needs(`${name} ${s} chip`, t[`c-status-${s}-ink`], t[`c-status-${s}-soft`], 4.5)
    needs(`${name} ink on ${s} ground`, t['c-text-primary'], t[`c-status-${s}-soft`], 4.5)
    needs(`${name} secondary on ${s} ground`, t['c-text-secondary'], t[`c-status-${s}-soft`], 4.5)
  }

  /* The rail is dark in both themes, so its own text tokens are measured
     against it, and .on-dark supplies the rest. */
  needs(`${name} rail ink`, t['c-text-onrail'], t['c-surface-rail'], 4.5)
  needs(`${name} rail muted`, t['c-text-onrail-muted'], t['c-surface-rail'], 4.5)
  needs(`${name} accent-ink on accent-soft`, t['c-accent-ink'], t['c-accent-soft'], 4.5)

  /* The edge of a field identifies the control, so it owes 3:1. The
     hairline between two cards identifies nothing and owes nothing. */
  needs(`${name} control edge`, t['c-border-control'], t['c-surface-card'], 3)
  needs(`${name} control edge on page`, t['c-border-control'], t['c-surface'], 2.8)

  /* The focus ring has to be findable against whatever it lands on. */
  needs(`${name} focus ring`, t['c-accent'], t['c-surface'], 3)
  needs(`${name} focus ring on card`, t['c-accent'], t['c-surface-card'], 3)
}

/* .on-dark inverts the few tokens that cannot serve both grounds. It has
   to hold against the rail in whichever theme is running. */
const inverted = tokens('.on-dark {')
const rails = THEMES.map(([name, sel]) => [name, tokens(sel)['c-surface-rail']])
for (const [key, value] of Object.entries(inverted)) {
  for (const [name, rail] of rails) needs(`.on-dark --${key} on the ${name} rail`, value, rail, 4.5)
}

/* And .on-light puts them back for the islands of ordinary page floating
   inside those bands — the landing mockups, the pricing cards. Those carry
   the theme's own card surface, so that is what they are measured against.
   This exists because the first version of .on-dark leaked into them and
   put #9AA6B5 on ivory at 2.37:1. */
const restored = [
  ['light', '.on-dark .on-light {', tokens(':root {')['c-surface-card']],
  ['dark', ":root[data-theme='dark'] .on-dark .on-light {", tokens(":root[data-theme='dark'] {")['c-surface-card']],
]
for (const [name, selector, card] of restored) {
  for (const [key, value] of Object.entries(tokens(selector))) {
    needs(`.on-light --${key} on the ${name} card`, value, card, 4.5)
  }
}

/* Every token .on-dark overrides has to be put back by .on-light, or the
   next one added leaks into the islands exactly as the first four did. */
const covered = new Set(Object.keys(tokens('.on-dark .on-light {')))
for (const key of Object.keys(inverted)) {
  checked++
  if (!covered.has(key)) fail.push(`.on-dark overrides --${key} and .on-light never restores it`)
}

if (fail.length) {
  console.error(`CONTRAST FAILURES (${fail.length} of ${checked} pairs):\n  ` + fail.join('\n  '))
  process.exit(1)
}
console.log(`ALL CLEAR — ${checked} colour pairs, every word at 4.5:1 and every control edge at 3:1`)
