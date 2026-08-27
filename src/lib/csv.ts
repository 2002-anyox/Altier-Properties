/* ------------------------------------------------------------------ *
 * CSV export
 *
 * Whatever is on screen, as a file. Built in the browser rather than on
 * the server because the filters, the sort and the currency are all
 * client state: asking the server for "the current view" would mean
 * teaching it what the current view is.
 * ------------------------------------------------------------------ */

/**
 * One field, quoted when it has to be.
 *
 * A leading =, +, - or @ makes a spreadsheet treat the value as a
 * formula, so a field starting with one is prefixed with a quote. Names
 * and memos are typed by people, and a client called "-Ltd" should not
 * execute anything when the file is opened.
 */
function field(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export type Column<T> = { header: string; value: (row: T) => unknown }

export function toCsv<T>(rows: T[], columns: Array<Column<T>>): string {
  const lines = [columns.map((c) => field(c.header)).join(',')]
  for (const row of rows) lines.push(columns.map((c) => field(c.value(row))).join(','))
  /* CRLF and a BOM, because the most likely destination is Excel and it
     reads a plain UTF-8 file as the system's legacy encoding — which
     turns every shilling sign and accented name into mojibake. */
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

/** Today's date, for a filename that sorts. */
const stamp = () => new Date().toISOString().slice(0, 10)

export function downloadCsv(name: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}-${stamp()}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** Builds the file and hands it over. Returns how many rows went in it. */
export function exportCsv<T>(name: string, rows: T[], columns: Array<Column<T>>): number {
  downloadCsv(name, toCsv(rows, columns))
  return rows.length
}
