/**
 * Express 4 does not forward a rejected promise from a handler to the error
 * middleware — it surfaces as an unhandled rejection and the request hangs
 * until the platform times it out. Now that every handler awaits the database,
 * each one is wrapped so a rejection lands on the central error renderer.
 */
export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
