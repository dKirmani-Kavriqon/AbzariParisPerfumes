/** HTML files imported by worker.ts are bundled as text by Wrangler (its default module rules). */
declare module '*.html' {
  const html: string
  export default html
}
