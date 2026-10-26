// Sitemap for search engines, built from the painting page data.

import { SITE_URL, getPaintingPages } from '../lib/paintingPages';

function sitemap() {
  const paths = ['/', '/privacy', '/paintings', '/zh/paintings'];
  for (const p of getPaintingPages()) {
    paths.push(`/paintings/${p.slug}`, `/zh/paintings/${p.slug}`);
  }
  const urls = paths.map(path => `  <url><loc>${SITE_URL}${path === '/' ? '' : path}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

export function getServerSideProps({ res }) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate');
  res.write(sitemap());
  res.end();
  return { props: {} };
}

export default function Sitemap() {
  return null;
}
