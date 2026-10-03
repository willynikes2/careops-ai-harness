let csrfToken = null;

// Identity stays in the server session. Only its CSRF token is kept in memory.
export async function api(path, { method = 'GET', body } = {}) {
  const verb = method.toUpperCase();
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (verb === 'POST' && path !== '/auth/login' && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  try {
    const response = await fetch(`/api${path}`, {
      method: verb, headers, credentials: 'same-origin', cache: 'no-store',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.status === 204 ? {} : await response.json().catch(() => null);
    if (response.status === 401) {
      csrfToken = null;
      // Keep the login form's error visible instead of reloading the same page.
      if (location.pathname !== '/' && location.pathname !== '/index.html') location.replace('/');
    }
    if (!response.ok) {
      return { error: data?.error ?? { code: 'request_failed', message: 'The request could not be completed. Please try again.' } };
    }
    if (data === null) {
      return { error: { code: 'invalid_response', message: 'The server returned an unreadable response. Refresh this page to check the latest data.' } };
    }
    if (path === '/auth/login' || path === '/auth/me') csrfToken = data.csrfToken;
    if (path === '/auth/logout') csrfToken = null;
    return data;
  } catch {
    return { error: { code: 'network_error', message: verb === 'POST'
      ? 'The connection was interrupted. The request may have reached the server. Check the latest data before trying again.'
      : 'Cannot reach CareOps right now. Check your connection and try again.' } };
  }
}

export const newKey = () => crypto.randomUUID();
