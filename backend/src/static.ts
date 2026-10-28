import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import type { Context } from 'hono';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
};

// Only the public site is served from the repository root; never backend/, docs/, .git or dotfiles.
const ALLOWED_TOP = new Set(['index.html', 'style.css', 'shells.css', 'app.js', 'scripts', 'assets', 'member', 'uyelik', 'host', 'admin', 'rezervasyon', 'mutfak',
  'coworking', 'toplanti-odasi', 'etkinlik-alani', 'language-meetup', 'tur', 'kulupler', 'iletisim']);

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
      // Code and pages are revalidated on every load so a deploy shows up without a hard refresh; images can be cached.
      const ext = extname(file).toLowerCase();
      const revalidate = ext === '.html' || ext === '.js' || ext === '.css';
      const lastModified = new Date(Math.floor(info.mtimeMs / 1000) * 1000);
      c.header('cache-control', revalidate ? 'no-cache' : 'public, max-age=86400');
      c.header('last-modified', lastModified.toUTCString());
      const since = Date.parse(c.req.header('if-modified-since') ?? '');
      if (!Number.isNaN(since) && lastModified.getTime() <= since) return c.body(null, 304);
      c.header('content-type', TYPES[ext] ?? 'application/octet-stream');
      return c.body(await readFile(file));
    } catch {
      return c.notFound();
    }
  };
}
