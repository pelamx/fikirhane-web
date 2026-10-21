// Where the Fikirhane API lives.
// - Served by the backend (npm start in backend/): same origin, "/api".
// - GitHub Pages: set PAGES_API_URL to the deployed API (e.g. "https://api.fikirhane.co/api"); empty keeps the browser-only preview.
const PAGES_API_URL = '';

export const API_BASE = location.hostname.endsWith('github.io') ? PAGES_API_URL : new URL('/api', location.origin).href;
