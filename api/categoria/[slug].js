/**
 * /categoria/:slug (rewrite en vercel.json). Una pagina por categoria del catalogo, para que
 * alguien que busca "frutos secos Villa Allende" encuentre una pagina que trata de eso, con su
 * texto y la lista de productos (cada uno con link a su ficha). Las categorias salen de los
 * productos visibles: si el comercio crea una nueva en el panel, tiene pagina sola.
 *
 * La tienda arranca encima y app.js filtra el catalogo por esta categoria (data-categoria).
 */
const S = require('../_lib/seo');

function cuerpoCategoria(cat, prods, otras, url) {
  const subs = [...new Set(prods.map(p => p.subcategoria).filter(Boolean))];
  const datos = [{
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: cat.nombre + ' en Villa Allende', url,
    mainEntity: {
      '@type': 'ItemList', numberOfItems: prods.length,
      itemListElement: prods.slice(0, 50).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: S.SITE_URL + '/producto/' + encodeURIComponent(p.slug), name: S.nombreDe(p) })),
    },
  }, {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: S.SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: cat.nombre, item: url },
    ],
  }];

  const lista = prods.map(p => {
    const sin = Number(p.stock) === 0;
    return '<li><a href="/producto/' + encodeURIComponent(p.slug) + '">' + S.esc(S.nombreDe(p)) + '</a> <span>' +
      (sin ? 'sin stock' : S.pesos(S.precioFinal(p))) + '</span></li>';
  }).join('');

  return `<section class="seo-pagina" id="seoCategoria" data-categoria="${S.esc(cat.raw)}">${datos.map(S.ld).join('')}<div class="container">
      <nav class="seo-migas" aria-label="Estás en"><a href="/">Inicio</a><span>›</span><span>${S.esc(cat.nombre)}</span></nav>
      <h1>${S.esc(cat.nombre)} en Villa Allende</h1>
      <p class="seo-intro">${cat.intro ? S.esc(cat.intro) + ' ' : ''}En Yerco Dietética tenemos ${prods.length} productos de ${S.esc(cat.nombre.toLowerCase())}, con envío a domicilio en ${S.ZONA} o retiro sin cargo en Tablada 16, Villa Allende.</p>
      ${subs.length ? '<p class="seo-subs">Incluye: ' + subs.map(s => S.esc(s.charAt(0) + s.slice(1).toLowerCase())).join(' · ') + '</p>' : ''}
      <details class="seo-lista"><summary>Ver la lista completa (${prods.length})</summary><ul>${lista}</ul></details>
      <p class="seo-otras">Otras categorías: ${otras.map(o => '<a href="/categoria/' + o.slug + '">' + S.esc(o.nombre) + '</a>').join(' · ')}</p>
    </div></section>`;
}

module.exports = async function handler(req, res) {
  const slug = (req.query.slug || '').toString().toLowerCase();
  let html = await S.indexHtml();
  if (!html) html = '<html><body>Yerco Dietética</body></html>';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  let todos = [];
  try { todos = await S.productosVisibles(); } catch (e) { todos = []; }

  const porCat = new Map();
  todos.forEach(p => {
    if (!p.categoria) return;
    const c = S.infoCategoria(p.categoria);
    if (!porCat.has(c.slug)) porCat.set(c.slug, { cat: c, prods: [] });
    porCat.get(c.slug).prods.push(p);
  });

  const hit = porCat.get(slug);
  if (!hit) {
    html = html.replace('<head>', '<head>\n    <meta name="robots" content="noindex">');
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(404).send(html);
  }

  const { cat } = hit;
  const prods = hit.prods.slice().sort((a, b) => (b.stock !== 0) - (a.stock !== 0) || S.nombreDe(a).localeCompare(S.nombreDe(b), 'es'));
  const otras = [...porCat.values()].map(v => v.cat).filter(c => c.slug !== slug).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const url = S.SITE_URL + '/categoria/' + slug;
  const conImagen = prods.find(p => p.imagen && !/default-product/.test(p.imagen));

  html = S.armarPagina(html, {
    titulo: cat.nombre + ' en Villa Allende | Yerco Dietética',
    desc: cat.nombre + ' en Yerco Dietética: ' + prods.length + ' productos con envío a domicilio en ' + S.ZONA + '. ' + (cat.intro || ''),
    url, imagen: conImagen ? S.imagenAbs(conImagen.imagen) : S.LOGO,
    cuerpo: cuerpoCategoria(cat, prods, otras, url),
  });

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  res.status(200).send(html);
};
