/**
 * Función serverless de Vercel: preview Open Graph de un producto.
 * Usa Firebase Admin SDK (lee Firestore del lado servidor, sin App Check ni reglas).
 * Requiere la variable de entorno FIREBASE_SERVICE_ACCOUNT (JSON del service account).
 * Agregar ?debug=1 para ver diagnóstico.
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const SITE_URL = 'https://www.yerco.ar';
const LOGO_FALLBACK = 'https://www.yerco.ar/img/LOGOS_Mesa%20de%20trabajo%201%20copia%2025.jpg.jpeg';

/* Inicializa Admin SDK una sola vez (reutiliza la instancia entre invocaciones) */
function getDb() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada');
    const cred = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(cred) });
  }
  return admin.firestore();
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function leerIndexHtml() {
  const candidatos = [
    path.join(process.cwd(), 'index.html'),
    path.join(process.cwd(), 'public', 'index.html'),
    '/var/task/index.html'
  ];
  for (const ruta of candidatos) {
    try {
      if (fs.existsSync(ruta)) return fs.readFileSync(ruta, 'utf-8');
    } catch (e) { /* sigue */ }
  }
  return null;
}

async function buscarProductoPorSlug(slug) {
  const db = getDb();
  const snap = await db.collection('productos').where('slug', '==', slug).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0].data();
  return {
    nombre: d.nombreMostrado || d.nombre || 'Producto',
    imagen: d.imagen || null,
    categoria: d.categoria || '',
    oculto: d.oculto === true
  };
}

module.exports = async function handler(req, res) {
  const slug = (req.query.slug || '').toString();
  const debug = req.query.debug === '1';

  let html = leerIndexHtml();
  if (!html) {
    try {
      const idxResp = await fetch(`${SITE_URL}/index.html`);
      html = await idxResp.text();
    } catch (e) {
      html = '<html><body>Yerco</body></html>';
    }
  }

  let producto = null;
  let errMsg = null;
  try {
    if (slug) producto = await buscarProductoPorSlug(slug);
  } catch (e) {
    errMsg = e.message;
  }

  let reemplazado = false;
  if (producto && !producto.oculto && html) {
    const titulo = escapeHtml(producto.nombre) + ' | Yerco Dietética';
    const desc = escapeHtml('Conseguilo en Yerco Dietética. Productos naturales y de calidad a la puerta de tu casa.');
    const imagen = producto.imagen ? escapeHtml(producto.imagen) : LOGO_FALLBACK;
    const url = `${SITE_URL}/producto/${escapeHtml(slug)}`;

    const ogTags = `<!--OG_START-->
    <meta property="og:title" content="${titulo}">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="${imagen}">
    <meta property="og:url" content="${url}">
    <meta property="og:type" content="product">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${titulo}">
    <meta name="twitter:description" content="${desc}">
    <meta name="twitter:image" content="${imagen}">
    <!--OG_END-->`;

    const before = html;
    html = html.replace(/<!--OG_START-->[\s\S]*?<!--OG_END-->/, ogTags);
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${titulo}</title>`);
    reemplazado = (html !== before);
  }

  if (debug) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(JSON.stringify({
      slug,
      indexLeido: !!html,
      adminConfigurado: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      producto: producto ? { nombre: producto.nombre, imagen: producto.imagen, oculto: producto.oculto } : null,
      reemplazado,
      error: errMsg
    }, null, 2));
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
};
