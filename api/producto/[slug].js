/**
 * Función serverless de Vercel: genera el preview (Open Graph) de un producto
 * para que al compartir el link en WhatsApp/Instagram/Facebook se vea la foto + nombre.
 *
 * Flujo:
 *  1. Recibe el slug desde la URL /producto/{slug}
 *  2. Busca el producto en Firestore vía API REST pública (productos son lectura pública)
 *  3. Toma el index.html y reemplaza los OG tags (entre <!--OG_START--> y <!--OG_END-->)
 *  4. Devuelve el HTML resultante
 *
 * Si algo falla, devuelve el index.html sin tocar (fallback seguro).
 */

const PROJECT_ID = 'yerco-bb620';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const SITE_URL = 'https://www.yerco.ar';
const LOGO_FALLBACK = 'https://www.yerco.ar/img/LOGOS_Mesa%20de%20trabajo%201%20copia%2025.jpg.jpeg';

/* Escapa caracteres para insertarlos de forma segura en atributos HTML */
function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* Consulta Firestore por el producto con ese slug (runQuery con filtro) */
async function buscarProductoPorSlug(slug) {
  const query = {
    structuredQuery: {
      from: [{ collectionId: 'productos' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'slug' },
          op: 'EQUAL',
          value: { stringValue: slug }
        }
      },
      limit: 1
    }
  };
  const resp = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query)
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const row = Array.isArray(data) ? data.find(r => r.document) : null;
  if (!row || !row.document) return null;
  const fields = row.document.fields || {};
  const getStr = (f) => fields[f] && (fields[f].stringValue !== undefined ? fields[f].stringValue : null);
  return {
    nombre: getStr('nombreMostrado') || getStr('nombre') || 'Producto',
    imagen: getStr('imagen') || null,
    categoria: getStr('categoria') || '',
    oculto: fields.oculto && fields.oculto.booleanValue === true
  };
}

module.exports = async function handler(req, res) {
  const slug = (req.query.slug || '').toString();

  // Traer el index.html del propio sitio
  let html;
  try {
    const idxResp = await fetch(`${SITE_URL}/index.html`);
    html = await idxResp.text();
  } catch (e) {
    res.status(500).send('Error');
    return;
  }

  let producto = null;
  try {
    if (slug) producto = await buscarProductoPorSlug(slug);
  } catch (e) {
    producto = null;
  }

  // Si encontramos el producto (y no está oculto), inyectar sus OG tags
  if (producto && !producto.oculto) {
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

    // Reemplazar el bloque OG y el title
    html = html.replace(/<!--OG_START-->[\s\S]*?<!--OG_END-->/, ogTags);
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${titulo}</title>`);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Cache: 5 min en CDN, permite revalidar
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
}
