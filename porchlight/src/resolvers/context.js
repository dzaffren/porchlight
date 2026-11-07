// Helpers for reading Forge's trusted context in a resolver.
//
// Forge hands each resolver a `req` object. req.context is filled in by Forge itself,
// so it cannot be changed from the browser. req.payload is whatever the page sent,
// so anything about *who* is calling must come from req.context, never the payload.

/**
 * Read the signed-in user's account ID from Forge's context.
 * Authors and adders always come from here, never from the payload, so nobody can act as someone else.
 *
 * @param {{ context?: { accountId?: string } }} req
 * @returns {string}
 * @throws {Error} when nobody is signed in. invoke() then rejects on the page.
 */
export function signedInAccountId(req) {
  const accountId = req.context?.accountId;
  if (!accountId) {
    throw new Error('Porchlight needs a signed-in Atlassian account.');
  }
  return accountId;
}
