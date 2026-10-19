/**
 * Prefix a public-dir asset path with Vite's base URL so it resolves
 * correctly when the site is served from a subpath (GitHub Pages project
 * site at /terra-winery/).
 *
 * `import.meta.env.BASE_URL` always ends with '/', so any leading slash
 * on the input is stripped before concatenation.
 */
export const asset = (p: string): string =>
  import.meta.env.BASE_URL + p.replace(/^\//, '')
