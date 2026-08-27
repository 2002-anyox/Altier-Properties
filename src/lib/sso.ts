/* ------------------------------------------------------------------ *
 * Single sign-on, client side
 *
 * The server finishes a Google or Apple sign-in by navigating the browser
 * back to the app, so a failure cannot be the reply to a fetch — it has
 * to survive a page load. It rides back in the query string, and is read
 * exactly once: leaving it there would re-announce a stale failure on
 * every refresh.
 * ------------------------------------------------------------------ */

export const SSO_ERROR_PARAM = 'sso_error'

/* Captured once per page load rather than once per call. React calls a
   useState initialiser twice under StrictMode, and a function that truly
   consumed the parameter would hand the second call nothing — which is
   how a real failure ends up silently swallowed in development. */
let captured: string | null | undefined

/**
 * The message the redirect brought back, taken out of the address bar so
 * a refresh does not re-announce it. Repeat calls return the same answer.
 */
export function takeSsoError(): string | null {
  if (captured !== undefined) return captured
  captured = readOnce()
  return captured
}

function readOnce(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const message = params.get(SSO_ERROR_PARAM)
  if (!message) return null

  params.delete(SSO_ERROR_PARAM)
  const query = params.toString()
  window.history.replaceState(
    null, '',
    `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
  )
  /* Bounded, because it is drawn as text and arrived from outside — a
     provider's error_description is not something to trust the length of. */
  return message.slice(0, 400)
}
