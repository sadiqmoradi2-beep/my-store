/** Swagger UI and spec: on outside production; in production only when ENABLE_API_DOCS=true is set on purpose */
export function apiDocsEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.ENABLE_API_DOCS !== undefined) return env.ENABLE_API_DOCS === 'true';
  return env.NODE_ENV !== 'production';
}
