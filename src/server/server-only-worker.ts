// Stand-in for the `server-only` package when Wrangler bundles worker.ts (see wrangler.jsonc
// "alias"). Next.js resolves `server-only` with its react-server condition and enforces the
// browser/server boundary at build time; Wrangler does not know that condition and would load
// the package's throwing entry. Everything worker.ts imports is server code by definition.
export {}
