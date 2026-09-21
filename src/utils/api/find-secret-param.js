/**
 * Find secret query parameter
 */

const SECRET_QUERY_PARAMS = new Set([
  'api_key', 'apikey', 'api-key', 'access_token', 'accesstoken', 'access-token',
  'token', 'auth_token', 'authtoken', 'auth-token', 'secret', 'key', 'password',
  'pwd', 'pass', 'signature', 'sig', 'hmac', 'client_secret', 'clientsecret',
  'client-secret', 'jwt', 'bearer', 'authorization', 'x-api-key', 'x-api-token',
  'x-auth-token', 'x-access-token', 'api_secret', 'apisecret', 'api-secret',
  'access_key', 'accesskey', 'session', 'session_token', 'sessiontoken',
  'id_token', 'idtoken', 'refresh_token', 'refreshtoken', 'auth'
]);

/**
 * Find secret query parameter in URL
 */
export const findSecretQueryParam = (url) => {
  try {
    const u = new URL(String(url || ''));
    for (const [key] of u.searchParams) {
      if (SECRET_QUERY_PARAMS.has(key.toLowerCase())) return key;
    }
  } catch { /* ignore */ }
  return null;
};