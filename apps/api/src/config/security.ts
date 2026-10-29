/** Swagger UI and spec: on outside production; in production only when ENABLE_API_DOCS=true is set on purpose */
export function apiDocsEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.ENABLE_API_DOCS !== undefined) return env.ENABLE_API_DOCS === 'true';
  return env.NODE_ENV !== 'production';
}

/** Values that appear in examples / old defaults — never acceptable as signing secrets */
const KNOWN_PLACEHOLDERS = new Set([
  'dev-secret-change-me',
  'dev-refresh-secret-change-me',
  'change-me',
  'changeme',
  'secret',
  'your-secret',
  'your-jwt-secret',
  'replace-me',
]);
const MIN_SECRET_LENGTH = 32;

/**
 * Fail closed at startup: the API never signs tokens (or receipt links) with a missing, placeholder, short or shared
 * secret. The error names the variable only — never its value.
 */
export function validateRequiredSecrets(env: Record<string, unknown>): Record<string, unknown> {
  const problems: string[] = [];
  for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = env[name];
    if (typeof value !== 'string' || !value.trim()) problems.push(`${name} is not set`);
    else if (KNOWN_PLACEHOLDERS.has(value.trim().toLowerCase()) || /change[-_ ]?me/i.test(value)) problems.push(`${name} is a placeholder value`);
    else if (value.length < MIN_SECRET_LENGTH) problems.push(`${name} must be at least ${MIN_SECRET_LENGTH} characters`);
    else if (new Set(value).size < 8) problems.push(`${name} is too repetitive`);
  }
  if (typeof env.JWT_SECRET === 'string' && env.JWT_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    problems.push('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }
  if (problems.length) {
    throw new Error(`Refusing to start — insecure configuration: ${problems.join('; ')}. Set strong random values (e.g. openssl rand -base64 48).`);
  }
  return env;
}
