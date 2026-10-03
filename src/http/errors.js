export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const errors = {
  unauth: () => new HttpError(401, 'unauthenticated', 'Please sign in.'),
  forbidden: (m = 'You do not have access to this.') => new HttpError(403, 'forbidden', m),
  notFound: (m = 'Not found.') => new HttpError(404, 'not_found', m),
  invalid: (m) => new HttpError(400, 'invalid_request', m),
  conflict: (m) => new HttpError(409, 'conflict', m),
  rateLimited: () => new HttpError(429, 'rate_limited', 'Too many requests — please wait a few minutes.'),
  aiUnavailable: (m = 'The AI service is unavailable right now.') => new HttpError(503, 'ai_unavailable', m),
};
export function errorHandler(logger) {
  return (err, req, res, _next) => {
    // body-parser errors (bad JSON, oversized body) are the client's fault, not a server error
    const parseError = !(err instanceof HttpError) && typeof err.type === 'string' && err.status >= 400 && err.status < 500;
    const status = err instanceof HttpError ? err.status : parseError ? 400 : 500;
    if (status === 500) logger.error(JSON.stringify({ correlationId: req.correlationId, error: err.stack }));
    res.status(status).json({ error: {
      code: err instanceof HttpError ? err.code : parseError ? 'invalid_request' : 'internal',
      message: status === 500 ? 'Something went wrong. Please try again.' : parseError ? 'The request body is not valid JSON.' : err.message,
      correlationId: req.correlationId } });
  };
}
