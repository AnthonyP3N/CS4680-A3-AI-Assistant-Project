// The views call api('/api/...') exactly as they did when FocusFlow had an
// Express server. Requests are now handled in the browser by backend.js.

import { handle } from './backend.js';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  try {
    return await handle(method, path, body);
  } catch (err) {
    if (!err.status || err.status >= 500) console.error(err);
    throw new ApiError(err.message || 'Something went wrong.', err.status || 500);
  }
}
