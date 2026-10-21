import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import type { Context } from 'hono';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
};

// Only the public site is served from the repository root; never backend/, docs/, .git or dotfiles.
const ALLOWED_TOP = new Set(['index.html', 'style.css', 'shells.css', 'app.js', 'scripts', 'assets', 'member', 'uyelik']);

/** Serves the static Fikirhane site so the frontend and API share one origin (no CORS, Lax cookies). */
export function staticSite(root: string) {
  return async (c: Context) => {
    let path: string;
    try { path = decodeURIComponent(new URL(c.req.url).pathname); } catch { return c.notFound(); }
    if (path.endsWith('/')) path += 'index.html';
    const rel = normalize(path).replace(/^([/\\])+/, '');
    const top = rel.split(/[/\\]/)[0];
    if (!ALLOWED_TOP.has(top) || rel.split(/[/\\]/).some(part => part.startsWith('.'))) return c.notFound();
    const file = join(root, rel);
    if (!file.startsWith(root + sep)) return c.notFound();
    try {
      const info = await stat(file);
      if (info.isDirectory()) return c.redirect(path + '/', 301);
      const data = await readFile(file);
      c.header('content-type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
      c.header('cache-control', extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600');
      return c.body(data);
    } catch {
      return c.notFound();
    }
  };
}
