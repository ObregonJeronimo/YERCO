/**
 * /sitemap.xml (rewrite en vercel.json): las paginas publicas de la tienda, una pagina por
 * categoria y la ficha de cada producto visible. Se arma en el momento leyendo Firestore con
 * el Admin SDK (misma cuenta de servicio que api/producto), asi que un producto nuevo o uno
 * que se oculta entra o sale solo, sin tocar ningun archivo. Cacheado 1 h en el CDN de Vercel.
 */
const S = require('./_lib/seo');

const FIJAS = [
  { loc: '/', prioridad: '1.0', frecuencia: 'daily' },
  { loc: '/mayoristas', prioridad: '0.6', frecuencia: 'monthly' },
  { loc: '/politicas', prioridad: '0.3', frecuencia: 'yearly' },
];

const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = async function handler(req, res) {
  const urls = FIJAS.map(f => ({ loc: S.SITE_URL + f.loc, prioridad: f.prioridad, frecuencia: f.frecuencia }));
  try {
    const prods = await S.productosVisibles();
    const cats = new Set();
    prods.forEach(p => { if (p.categoria) cats.add(S.infoCategoria(p.categoria).slug); });
    [...cats].sort().forEach(c => urls.push({ loc: S.SITE_URL + '/categoria/' + c, prioridad: '0.8', frecuencia: 'weekly' }));
    prods.forEach(p => urls.push({ loc: S.SITE_URL + '/producto/' + encodeURIComponent(p.slug), prioridad: '0.7', frecuencia: 'weekly' }));
  } catch (e) {
    /* sin Firestore se publica igual el sitemap con las paginas fijas */
  }
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => '  <url><loc>' + xmlEsc(u.loc) + '</loc><changefreq>' + u.frecuencia + '</changefreq><priority>' + u.prioridad + '</priority></url>').join('\n') +
    '\n</urlset>\n';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
};
