// scripts/build_sitemap.js
// Generates sitemap.xml for EuroInference static pages.
// Licensed under AGPL-3.0.

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const BASE_URL = 'https://euroinference.eu';

const PAGES = [
  { file: 'index.html', path: '', changefreq: 'daily', priority: '1.0' },
  { file: 'methodology.html', path: 'methodology.html', changefreq: 'weekly', priority: '0.8' },
  { file: 'credits.html', path: 'credits.html', changefreq: 'monthly', priority: '0.5' },
  { file: 'privacy.html', path: 'privacy.html', changefreq: 'monthly', priority: '0.5' }
];

function getFileLastMod(filename) {
  try {
    const stats = fs.statSync(path.join(ROOT_DIR, filename));
    return stats.mtime.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function generateSitemap() {
  const urls = PAGES.map(p => {
    const loc = p.path ? `${BASE_URL}/${p.path}` : `${BASE_URL}/`;
    const lastmod = getFileLastMod(p.file);
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  const targetPath = path.join(ROOT_DIR, 'sitemap.xml');
  fs.writeFileSync(targetPath, xml, 'utf8');
  console.log(`Generated sitemap.xml at ${targetPath}`);
}

generateSitemap();
