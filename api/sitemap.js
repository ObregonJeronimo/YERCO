/**
 * /sitemap.xml (rewrite en vercel.json): las paginas publicas de la tienda y la ficha de
 * cada producto visible. Se arma en el momento leyendo Firestore con el Admin SDK (misma
 * cuenta de servicio que api/producto), asi que un producto nuevo o uno que se oculta
 * entra o sale solo, sin tocar ningun archivo. Cacheado 1 h en el CDN de Vercel.
 */
const admin = require('firebase-admin');

const SITE_URL = 'https://www.yerco.ar';
const FIJAS = [
  { loc: '/', prioridad: '1.0', frecuencia: 'daily' },
  { loc: '/mayoristas', prioridad: '0.6', frecuencia: 'monthly' },
  { loc: '/politicas', prioridad: '0.3', frecuencia: 'yearly' },
];

function getDb() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return admin.firestore();
}

const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = async function handler(req, res) {
  const urls = FIJAS.map(f => ({ loc: SITE_URL + f.loc, prioridad: f.prioridad, frecuencia: f.frecuencia }));
  try {
    const snap = await getDb().collection('productos').select('slug', 'oculto').get();
    const vistos = new Set();
    snap.forEach(d => {
      const p = d.data();
      if (!p.slug || p.oculto === true || vistos.has(p.slug)) return;
      vistos.add(p.slug);
      urls.push({ loc: SITE_URL + '/producto/' + encodeURIComponent(p.slug), prioridad: '0.7', frecuencia: 'weekly' });
    });
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
