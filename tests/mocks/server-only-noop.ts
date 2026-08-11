// `server-only` throws unless imported through Next.js's own bundler, which
// Vitest is not. Tests prove server-only modules are only reached from
// route handlers/server components, so this is a safe no-op stand-in.
export {};
