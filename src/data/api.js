// The UI calls api('/api/...') like a REST API. Requests are handled in the
// browser by backend.js, which saves to localStorage.

import { handle } from './backend.js';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** onProgress (AI routes only) receives live events from the refinement loop. */
export async function api(path, { method = 'GET', body, onProgress } = {}) {
  try {
    return await handle(method, path, body, { onProgress });
  } catch (err) {
    if (!err.status || err.status >= 500) console.error(err);
    throw new ApiError(err.message || 'Something went wrong.', err.status || 500);
  }
}
