/* ------------------------------------------------------------------ *
 * The address, above the router
 *
 * BootGate decides between the landing page, the sign-in form and an
 * invitation before any router exists — that decision is what mounts the
 * router in the first place. So it reads the address itself.
 *
 * Reading it once, at mount, was enough while the only way to arrive at
 * an invitation was to paste the link and load the page. It is not enough
 * now: pressing "Sign In" on the landing page changes the hash without
 * reloading, and nothing would notice. This subscribes.
 * ------------------------------------------------------------------ */

import { useEffect, useState } from 'react'

/** The current `#…`, kept in step with the address bar and the back button. */
export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const read = () => setHash(window.location.hash)
    window.addEventListener('hashchange', read)
    /* A hash set between the first render and this effect — a click on a
       link during hydration — would otherwise be missed. */
    read()
    return () => window.removeEventListener('hashchange', read)
  }, [])
  return hash
}

/** Where a signed-out visitor is. */
export type Door = 'landing' | 'signin' | { join: string }

export function doorFrom(hash: string): Door {
  const invitation = /^#\/join\/([A-Za-z0-9_-]+)/.exec(hash)
  if (invitation) return { join: invitation[1]! }
  if (/^#\/(signin|sign-in|login)\b/.test(hash)) return 'signin'
  return 'landing'
}

/** Go to a hash route without a page load. */
export const goTo = (hash: string) => { window.location.hash = hash }
