/**
 * YERCO DIETÉTICA - SCRIPT PRINCIPAL
 * Firebase Firestore + Filtros jerárquicos + Búsqueda + Orden + Paginación
 */
const WHATSAPP_NUMBER = '5493515314675';
const PRODUCTS_PER_PAGE = 10;
/* optImg devuelve la URL tal cual, a proposito. Redimensionar del lado del servidor
   necesitaria la extension Resize Images de Firebase (no hay ninguna instalada en el
   proyecto) o guardar variantes al subir. Se evaluo y no da: el hero pesa 146 KB y
   mide 886x665, o sea que ya es MAS CHICO que el ancho que se le pedia (1600) y que
   la pantalla donde se muestra a pantalla completa; achicarlo empeoraria la calidad
   sin ahorrar casi nada. Lo que si dolia era otra cosa: Storage lo servia con
   "private, max-age=0" y el navegador se lo bajaba entero en cada visita. Eso ya
   esta arreglado (metadata del objeto + cacheControl al subir desde el panel).

   Las imagenes de PRODUCTO se midieron aparte, las 778 del catalogo: 88,6 MB en
   total, y el problema no era el ancho sino el formato. Los JPG pesaban 20 KB de
   promedio a 600x600, que para una tarjeta de 400 esta bien; los 127 PNG pesaban
   595 KB de promedio y sumaban 73,9 MB, o sea el 16% de las imagenes era el 83%
   del peso, con casos de 1,5 MB para una tarjeta de 400 px. Eran de antes de que
   el panel comprimiera al subir: hoy uploadImage() las pasa por compressImage()
   a WebP y 1200 de ancho maximo, asi que el goteo estaba cortado y lo que quedaba
   era el legado. Se migraron a WebP con la misma receta del panel (78,7 MB -> 2,2 MB)
   y los PNG originales quedaron en Storage de respaldo.

   O sea que aca ya no hay nada que redimensionar: lo que llega esta comprimido al
   subir. Si algun dia se instala la extension Resize Images, este es el lugar. */
function optImg(url,w){return url||'';}
/* Etiqueta corta para un botón del sistema viejo de gramajes.
   Antes el fallback era `h.nombre`, o sea el nombre interno entero: al lado de una
   máscara de grupo de 5 caracteres ("250gr") salía un botón de 25 o más.
   Orden elegido mirando los datos que hay cargados de verdad: los hijos que no
   tienen `gramaje` SÍ tienen `grupoMascara` (los dos casos que existen hoy en la
   base), asi que esa es la primera alternativa. Si tampoco está, se saca el
   peso/volumen del nombre, que es lo único corto y previsible que queda. */
function gramajeLabel(h){
    if(!h)return 'Otra presentación';
    if(h.gramaje)return h.gramaje;
    if(h.grupoMascara)return h.grupoMascara;
    const m=/(\d+(?:[.,]\d+)?)\s*(kilos|kilo|kg|gramos|gramo|grs|gr|g|litros|litro|lts|lt|ml|cc|unidades|unidad|un)\b/i.exec(h.nombre||'');
    if(m)return m[1]+' '+m[2].toLowerCase();
    return 'Otra presentación';
}
/* El año del copyright estaba escrito a mano en index.html y habia quedado en 2024.
   No merece un campo en el panel: se saca del reloj y no vuelve a envejecer. */
function initFooterAnio(){const el=document.getElementById('footerAnio');if(el)el.textContent=new Date().getFullYear();}
let productos = [];
let _gruposMeta = {}; // estructura de grupos incluyendo ocultos: { grupoId: { principalOrden, miembros:[{id,orden,oculto,principal}] } }
let carrito = [];
let categoriaActual = 'Todos';
let subcategoriaActual = null;
let ordenPrecio = null;
let ordenAlfa = null;
let busquedaTexto = '';
let paginaActual = 1;

document.addEventListener('DOMContentLoaded', () => {
    initNavbar(); initParticles(); initContactForm(); initCart(); initFooterAnio();
    loadProductsFromFirebase(); initScrollAnimations(); initAutoScrollProductos();
    /* Botón atrás/adelante del navegador: abrir o cerrar el producto según la URL */
    window.addEventListener('popstate', () => {
        const path=window.location.pathname;
        const modalAbierto=document.getElementById('productDetailModal')?.classList.contains('show');
        if(path.startsWith('/producto/')){
            const slug=decodeURIComponent(path.replace('/producto/','').replace(/\/$/,''));
            const p=productos.find(x=>x.slug===slug);
            if(p)openProductDetailModal(p.id);
        }else if(modalAbierto){
            /* Cerrar sin volver a tocar el history (ya cambió por el botón atrás) */
            document.getElementById('productDetailModal')?.classList.remove('show');
            document.getElementById('productDetailOverlay')?.classList.remove('show');
            document.body.style.overflow='';
        }
    });
});

function initNavbar() {
    const navbar = document.getElementById('mainNavbar');
    window.addEventListener('scroll', () => { navbar.classList.toggle('scrolled', window.scrollY > 50); updateActiveNavLink(); });
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => { const c = document.querySelector('.navbar-collapse'); if (c.classList.contains('show')) bootstrap.Collapse.getInstance(c)?.hide(); });
    });
}
function updateActiveNavLink() {
    let cur = '';
    document.querySelectorAll('section[id]').forEach(s => { if (window.scrollY >= s.offsetTop - 100 && window.scrollY < s.offsetTop - 100 + s.offsetHeight) cur = s.id; });
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + cur));
}

function initParticles() {
    const c = document.getElementById('particles'); if (!c) return;
    if (window.innerWidth < 768) return;
    const count = window.innerWidth < 1200 ? 6 : 10;
    for (let i = 0; i < count; i++) { const p = document.createElement('div'); p.className='particle'; p.style.left=Math.random()*100+'%'; p.style.top=Math.random()*100+'%'; p.style.animationDelay=Math.random()*15+'s'; p.style.animationDuration=(15+Math.random()*10)+'s'; p.style.width=(5+Math.random()*15)+'px'; p.style.height=p.style.width; c.appendChild(p); }
}

function initContactForm() {
    const form = document.getElementById('contactForm'); if (!form) return;
    form.addEventListener('submit', (e) => { e.preventDefault(); const n=document.getElementById('nombre').value.trim(),em=document.getElementById('email').value.trim(),m=document.getElementById('mensaje').value.trim(); const cap=s=>s?s.charAt(0).toUpperCase()+s.slice(1):s; const msg='Hola! Mi nombre es *'+cap(n)+'*, tengo una consulta:\n\n'+cap(m)+'\n\nMi mail es: '+em; window.open('https://wa.me/'+WHATSAPP_NUMBER+'?text='+encodeURIComponent(msg),'_blank'); form.reset(); if(document.getElementById('chatFloatBox'))document.getElementById('chatFloatBox').classList.remove('show'); if(document.getElementById('chatFloatBtn'))document.getElementById('chatFloatBtn').classList.remove('hide'); });
}

async function loadProductsFromFirebase(retries) {
    if (retries === undefined) retries = 2;
    const loading = document.getElementById('productsLoading'); if (loading) loading.classList.add('show');
    try {
        const snap = await db.collection('productos').get();
        const _todos = snap.docs.map(d => { const r=d.data(); return { id:d.id, nombre:r.nombre||'', nombreMostrado:r.nombreMostrado||null, gramaje:r.gramaje||null, gramajePadreId:r.gramajePadreId||null, grupoId:r.grupoId||null, grupoPrincipal:r.grupoPrincipal===true, grupoMascara:r.grupoMascara||null, grupoOrden:(typeof r.grupoOrden==='number'?r.grupoOrden:999), slug:r.slug||null, precio:r.precio||0, descuento:Math.min(100,Math.max(0,r.descuento||0)), stock:r.stock||0, categoria:r.categoria||'', subcategoria:r.subcategoria||null, imagen:r.imagen||null, descripcion:r.descripcion||r.nombre||'', popular:r.popular||false, oculto:r.oculto===true, valoresNutricionales:r.valoresNutricionales||'', imagenesExtra:r.imagenesExtra||[] }; });
        /* Capturar la estructura de los grupos ANTES de filtrar ocultos, para saber el orden
           del principal aunque esté oculto (necesario para elegir la cara del grupo). */
        _gruposMeta = {};
        _todos.forEach(p => {
            if (!p.grupoId || p.gramajePadreId) return;
            if (!_gruposMeta[p.grupoId]) _gruposMeta[p.grupoId] = { principalOrden: null, miembros: [] };
            const ord = (typeof p.grupoOrden === 'number' ? p.grupoOrden : 999);
            _gruposMeta[p.grupoId].miembros.push({ id: p.id, orden: ord, oculto: p.oculto, principal: p.grupoPrincipal === true });
            if (p.grupoPrincipal === true) _gruposMeta[p.grupoId].principalOrden = ord;
        });
        productos = _todos.filter(p => !p.oculto);
        renderCategoryFilters(getCategoriasConSub(productos)); aplicarFiltros();
        _searchCache.clear();
        /* Sincronizar carrito guardado con productos actuales (precio, stock, disponibilidad) */
        const cambiosCarrito=reconciliarCarrito();
        updateCartUI();
        if(cambiosCarrito.length){avisarCambiosCarrito(cambiosCarrito);}
        /* Si la URL es /producto/{slug}, abrir ese producto */
        abrirProductoDesdeURL();
        /* Scroll automático a productos si la URL tiene #productos o si es la carga inicial */
        if(!window._autoScrollDone){
            window._autoScrollDone=true;
            /* Las dos ramas del ternario eran iguales ('productos'), asi que la pagina
               SIEMPRE se bajaba sola al cargar y nadie llegaba a ver el hero. Ahora
               solo baja si la URL lo pide. */
            const target=window.location.hash==='#productos'?'productos':null;
            if(target){
                setTimeout(()=>{const s=document.getElementById(target);if(s)s.scrollIntoView({behavior:'smooth',block:'start'});},600);
            }
        }
    } catch(e) { console.error(e); if(retries>0){setTimeout(()=>loadProductsFromFirebase(retries-1),1500);return;} showToast('Error al cargar productos.','error'); }
    finally { if (loading) loading.classList.remove('show'); }
}


function getCategoriasConSub(prods) {
    const m = {}; prods.forEach(p => { if(!p.categoria)return; if(!m[p.categoria])m[p.categoria]=new Set(); if(p.subcategoria)m[p.categoria].add(p.subcategoria); }); return m;
}

function _norm(s){return(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
/* Levenshtein iterativo - sin recursión, mucho más rápido */
function _levenshtein(a,b){const la=a.length,lb=b.length;if(!la)return lb;if(!lb)return la;if(Math.abs(la-lb)>2)return 3;/* atajo: si difieren mucho en largo, no vale la pena */const row=Array.from({length:lb+1},(_,i)=>i);for(let i=1;i<=la;i++){let prev=i;for(let j=1;j<=lb;j++){const val=a[i-1]===b[j-1]?row[j-1]:1+Math.min(prev,row[j],row[j-1]);row[j-1]=prev;prev=val;}row[lb]=prev;}return row[lb];}
const _STOPWORDS=new Set(['de','la','el','los','las','un','una','unos','unas','con','sin','y','o','en','a','al','del','x']);
/* Cache de textos normalizados por producto */
const _searchCache=new Map();
function _getTexto(p){if(_searchCache.has(p.id))return _searchCache.get(p.id);const t=_norm((p.nombreMostrado||p.nombre)+' '+p.categoria+' '+(p.subcategoria||'')+' '+(p.descripcion||''));_searchCache.set(p.id,t);return t;}
/* Quita plurales y sufijos comunes para comparar raíces (nueces→nuez, aceites→aceit) */
function _raiz(w){w=w.replace(/ces$/,'z');w=w.replace(/es$/,'');w=w.replace(/s$/,'');return w;}
function _matchPalabra(pal,texto){const words=texto.split(/\s+/);/* palabras cortas (<=3 letras): solo match al inicio de alguna palabra, evita falsos positivos como 'te' en 'inTEgral' */if(pal.length<=3){return words.some(w=>w.startsWith(pal));}if(texto.includes(pal))return true;const palR=_raiz(pal);for(const w of words){const wR=_raiz(w);if(wR===palR)return true;if(wR.length>=3&&palR.length>=3&&(wR.startsWith(palR)||palR.startsWith(wR)))return true;/* fuzzy solo para typos en palabras largas */if(pal.length>=5&&Math.abs(w.length-pal.length)<=2&&_levenshtein(pal,w)<=1)return true;}return false;}
function _searchScore(q,p){const texto=_getTexto(p);const palabras=_norm(q).split(/\s+/).filter(w=>w.length>1&&!_STOPWORDS.has(w));if(!palabras.length)return 1;return palabras.every(pal=>_matchPalabra(pal,texto))?1:0;}
/* Debounce: espera 200ms desde el último keystroke antes de filtrar */
let _searchTimer=null;
function onSearchInput(v){busquedaTexto=v;clearTimeout(_searchTimer);_searchTimer=setTimeout(()=>{paginaActual=1;aplicarFiltros();},200);}
function _ordenGrupo(p){ return (typeof p.grupoOrden === 'number' ? p.grupoOrden : 999); }
/* Determina qué presentación (visible) es la "cara" de un grupo en el grid:
   - Si el principal está visible → es la cara.
   - Si el principal está oculto → la siguiente cantidad más grande en el orden (entre las visibles).
   - Si el principal era el más grande y se ocultó → la más grande disponible (la más cercana hacia abajo).
   Cuando el principal vuelve a estar visible, automáticamente vuelve a ser la cara (no tocamos Firestore). */
function _caraDelGrupo(gid){
    const visibles = productos.filter(p => p.grupoId === gid && !p.gramajePadreId);
    if (!visibles.length) return null;
    /* Principal visible → es la cara */
    const principalVisible = visibles.find(p => p.grupoPrincipal === true);
    if (principalVisible) return principalVisible.id;
    /* Principal oculto o inexistente: usar el orden del principal (guardado en la metadata) */
    const meta = _gruposMeta[gid];
    const principalOrden = (meta && meta.principalOrden != null) ? meta.principalOrden : -Infinity;
    /* La siguiente cantidad más grande: menor orden que sea mayor al del principal */
    const masGrandes = visibles.filter(p => _ordenGrupo(p) > principalOrden).sort((a,b) => _ordenGrupo(a)-_ordenGrupo(b));
    if (masGrandes.length) return masGrandes[0].id;
    /* No hay ninguna más grande (el principal era el más grande): tomar la más grande disponible */
    const porOrdenDesc = [...visibles].sort((a,b) => _ordenGrupo(b)-_ordenGrupo(a) || String(a.id).localeCompare(String(b.id)));
    return porOrdenDesc[0].id;
}
function aplicarFiltros() {
    let r = [...productos];
    /* Excluir productos hijos de gramaje: solo se muestran como botones dentro del padre de gramaje */
    r = r.filter(p => !p.gramajePadreId);
    /* Grupos de presentación: en el grid se muestra UNA cara por grupo (ver _caraDelGrupo).
       Esto maneja: principal visible, principal oculto (siguiente más grande), y grupos sin principal. */
    const _caraPorGrupo = {};
    const _gruposVistos = new Set();
    productos.forEach(p => { if (p.grupoId && !p.gramajePadreId) _gruposVistos.add(p.grupoId); });
    _gruposVistos.forEach(gid => { _caraPorGrupo[gid] = _caraDelGrupo(gid); });
    r = r.filter(p => {
        if (!p.grupoId) return true;
        return _caraPorGrupo[p.grupoId] === p.id;
    });
    if (categoriaActual === 'Populares') r = r.filter(p => p.popular === true);
    else if (categoriaActual === 'Ofertas') r = r.filter(p => (p.descuento||0) > 0);
    else if (categoriaActual !== 'Todos') r = r.filter(p => p.categoria === categoriaActual);
    if (subcategoriaActual) r = r.filter(p => p.subcategoria === subcategoriaActual);
    if (busquedaTexto) { r=r.filter(p=>_searchScore(busquedaTexto,p)>0); }
    r.sort((a,b)=>{
        if(ordenAlfa){const cmp=(a.nombre||'').localeCompare(b.nombre||'','es');if(cmp!==0)return ordenAlfa==='asc'?cmp:-cmp;}
        if(ordenPrecio){const cmp=precioFinal(a)-precioFinal(b);if(cmp!==0)return ordenPrecio==='asc'?cmp:-cmp;}
        return 0;
    });
    renderProductsPaginated(r); updateSortButtonUI();
}

function filterByCategory(cat) { categoriaActual=cat; subcategoriaActual=null; paginaActual=1; aplicarFiltros(); }
function filterBySubCategory(cat,sub) { categoriaActual=cat; subcategoriaActual=sub; paginaActual=1; aplicarFiltros(); }
function toggleSortPrice() { ordenAlfa=null; if(!ordenPrecio)ordenPrecio='asc';else if(ordenPrecio==='asc')ordenPrecio='desc';else ordenPrecio='asc'; paginaActual=1; aplicarFiltros(); }
function toggleSortAlfa() { ordenPrecio=null; if(!ordenAlfa)ordenAlfa='asc';else if(ordenAlfa==='asc')ordenAlfa='desc';else ordenAlfa='asc'; paginaActual=1; aplicarFiltros(); }
function updateSortButtonUI() { const b=document.getElementById('sortBtn'),a=document.getElementById('sortAlfaBtn'); if(b){b.innerHTML=ordenPrecio==='desc'?'<i class="bi bi-sort-numeric-down-alt"></i> Mayor precio':'<i class="bi bi-sort-numeric-up"></i> Menor precio';b.style.borderColor=ordenPrecio?'var(--color-primary)':'';b.style.opacity=ordenPrecio?'1':'0.5';} if(a){a.innerHTML=ordenAlfa==='desc'?'<i class="bi bi-sort-alpha-up-alt"></i> Z-A':'<i class="bi bi-sort-alpha-down"></i> A-Z';a.style.borderColor=ordenAlfa?'var(--color-primary)':'';a.style.opacity=ordenAlfa?'1':'0.5';} }

function renderCategoryFilters(mapa) {
    const container = document.getElementById('categoryFilters'); if (!container) return;
    container.innerHTML = '';
    const popBtn = document.createElement('button');
    popBtn.className = 'filter-btn'+(categoriaActual==='Populares'?' active':''); popBtn.innerHTML = '<i class="bi bi-star-fill" style="margin-right:4px"></i>Populares';
    popBtn.addEventListener('click', () => { setActiveFilter(popBtn); hideAllSubFilters(); filterByCategory('Populares'); });
    container.appendChild(popBtn);
    const todosBtn = document.createElement('button');
    todosBtn.className = 'filter-btn'+(categoriaActual==='Todos'?' active':''); todosBtn.textContent = 'Todos';
    todosBtn.addEventListener('click', () => { setActiveFilter(todosBtn); hideAllSubFilters(); filterByCategory('Todos'); });
    container.appendChild(todosBtn);
    if(productos.some(p=>(p.descuento||0)>0)){
        const ofBtn=document.createElement('button');
        ofBtn.className='filter-btn'+(categoriaActual==='Ofertas'?' active':'');
        ofBtn.innerHTML='<i class="bi bi-tag-fill" style="margin-right:4px;color:#e6a23c"></i>Ofertas';
        ofBtn.addEventListener('click',()=>{setActiveFilter(ofBtn);hideAllSubFilters();subcategoriaActual=null;paginaActual=1;filterByCategory('Ofertas');});
        container.appendChild(ofBtn);
    }
    Object.keys(mapa).sort((a,b)=>{const yA=a.toUpperCase().startsWith('YERBA')?1:0;const yB=b.toUpperCase().startsWith('YERBA')?1:0;if(yA!==yB)return yA-yB;return a.localeCompare(b);}).forEach(cat => {
        const subs = [...mapa[cat]].sort();
        const wrapper = document.createElement('div'); wrapper.className = 'filter-group';
        const catBtn = document.createElement('button'); catBtn.className = 'filter-btn'; catBtn.textContent = cat;
        const subRow = document.createElement('div'); subRow.className = 'sub-filters-row';
        if (subs.length > 0) {
            const allBtn = document.createElement('button'); allBtn.className = 'sub-btn active'; allBtn.textContent = 'Todo';
            allBtn.addEventListener('click', () => { subRow.querySelectorAll('.sub-btn').forEach(b=>b.classList.remove('active')); allBtn.classList.add('active'); subcategoriaActual=null; paginaActual=1; aplicarFiltros(); });
            subRow.appendChild(allBtn);
            subs.forEach(sub => {
                const subBtn = document.createElement('button'); subBtn.className = 'sub-btn'; subBtn.textContent = sub;
                subBtn.addEventListener('click', () => { subRow.querySelectorAll('.sub-btn').forEach(b=>b.classList.remove('active')); subBtn.classList.add('active'); filterBySubCategory(cat,sub); });
                subRow.appendChild(subBtn);
            });
        }
        catBtn.addEventListener('click', () => { setActiveFilter(catBtn); hideAllSubFilters(); if(subs.length>0)subRow.classList.add('show'); subcategoriaActual=null; paginaActual=1; filterByCategory(cat); });
        wrapper.appendChild(catBtn);
        if (subs.length > 0) wrapper.appendChild(subRow);
        container.appendChild(wrapper);
    });
}
function setActiveFilter(btn) { document.querySelectorAll('#categoryFilters .filter-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); }
function hideAllSubFilters() { document.querySelectorAll('.sub-filters-row').forEach(r=>r.classList.remove('show')); }

function formatPrice(v) { const n=Number(v)||0; return n.toLocaleString('es-AR',{minimumFractionDigits:0}); }
/* Precio final que paga el cliente (aplica descuento del producto si tiene) */
function precioFinal(p){const dsc=Math.min(100,Math.max(0,p.descuento||0));return dsc>0?Math.round(p.precio*(1-dsc/100)):p.precio;}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}

function renderProductsPaginated(list) {
    const totalPages = Math.ceil(list.length / PRODUCTS_PER_PAGE);
    if (paginaActual > totalPages) paginaActual = totalPages || 1;
    const start = (paginaActual - 1) * PRODUCTS_PER_PAGE;
    const end = start + PRODUCTS_PER_PAGE;
    const pageItems = list.slice(start, end);
    renderProducts(pageItems);
    renderPagination(totalPages, list.length);
}

function renderPagination(totalPages, totalItems) {
    const container = document.getElementById('paginationContainer'); if(!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    let html = '<div class="pagination-container">';
    html += '<button onclick="goToPage('+(paginaActual-1)+')"'+(paginaActual===1?' disabled':'')+'><i class="bi bi-chevron-left"></i></button>';
    for (let i = 1; i <= totalPages; i++) {
        if (totalPages <= 7 || i === 1 || i === totalPages || (i >= paginaActual - 1 && i <= paginaActual + 1)) {
            html += '<button onclick="goToPage('+i+')"'+(i===paginaActual?' class="active"':'')+'>'+i+'</button>';
        } else if (i === paginaActual - 2 || i === paginaActual + 2) {
            html += '<span style="padding:0 0.3rem;color:var(--color-text-light)">...</span>';
        }
    }
    html += '<button onclick="goToPage('+(paginaActual+1)+')"'+(paginaActual===totalPages?' disabled':'')+'><i class="bi bi-chevron-right"></i></button>';
    html += '</div>';
    html += '<p class="pagination-info">Mostrando '+(((paginaActual-1)*PRODUCTS_PER_PAGE)+1)+' - '+Math.min(paginaActual*PRODUCTS_PER_PAGE, totalItems)+' de '+totalItems+' productos</p>';
    container.innerHTML = html;
}

function goToPage(page) {
    paginaActual = page;
    aplicarFiltros();
    const section = document.getElementById('productos');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderProducts(list) {
    const c = document.getElementById('productsGrid'); if(!c)return;
    if (list.length===0) { c.innerHTML='<div class="empty-products"><i class="bi bi-search" style="font-size:2.5rem;color:var(--color-text-light)"></i><p style="color:var(--color-text-light);margin-top:1rem;font-size:1.05rem">No se encontraron productos</p></div>'; return; }
    c.innerHTML = list.map(p => {
        const ci=carrito.find(i=>i.id===p.id),qty=ci?ci.cantidad:0;
        const img=optImg(p.imagen,400)||'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23e8e0d5%22 width=%22400%22 height=%22300%22/%3E%3Ctext x=%22200%22 y=%22155%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2216%22%3ESin imagen%3C/text%3E%3C/svg%3E';
        const noStock = p.stock === 0;
        const maxOut = qty>=p.stock;
        let btnContent;
        if(noStock){
            btnContent='<span class="atc-text"><i class="bi bi-x-circle"></i> Sin stock</span>';
        }else if(qty===0){
            btnContent='<span class="atc-text"><i class="bi bi-cart-plus"></i> Agregar</span>';
        }else{
            btnContent='<span class="atc-qty-wrap"><button class="atc-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+p.id+'\',-1)"><i class="bi bi-dash"></i></button><span class="atc-qty-num">'+qty+'</span><button class="atc-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+p.id+'\',1)"'+(maxOut?' disabled':'')+'><i class="bi bi-plus"></i></button></span>';
        }
        const atcTag=qty>0?'div':'button';
        const atcAttrs=qty>0
            ?'class="add-to-cart-btn added"'
            :'class="add-to-cart-btn"'+(noStock?' disabled':'')+' onclick="'+(qty===0?'addToCart(\''+p.id+'\')':'event.stopPropagation()')+'"';
        /* Grupos de presentación (sistema nuevo): miembros del mismo grupoId.
           Se resuelve ANTES que los gramajes porque decide si el sistema viejo se
           dibuja o no (ver el comentario de `hijos`). */
        const miembros=p.grupoId?productos.filter(m=>m.grupoId===p.grupoId).sort((a,b)=>(a.grupoOrden??999)-(b.grupoOrden??999)):[];
        const usaSelectorGrupo=miembros.length>1;
        /* Gramajes asociados (sistema viejo): hijos de este producto.
           Los dos sistemas de presentaciones convivían y la tarjeta los concatenaba
           sin `else`, asi que un producto con grupoId Y ADEMAS hijos gramajePadreId
           mostraba su presentación dos veces: arriba la máscara corta del grupo y
           abajo, debajo del botón Agregar, el nombre interno entero.
           Gana el sistema de grupos: tiene `grupoMascara`, un campo hecho para dar
           una etiqueta corta; el viejo no tiene con qué y por eso caía al nombre. */
        const hijos=usaSelectorGrupo?[]:productos.filter(h=>h.gramajePadreId===p.id);
        const gramajeHTML=hijos.length>0?'<div class="gramaje-btns">'+
            '<button class="gramaje-btn active" onclick="event.stopPropagation();addToCart(\''+p.id+'\')" data-id="'+p.id+'">'+esc(p.gramaje||'Base')+'</button>'+
            hijos.map(h=>'<button class="gramaje-btn" onclick="event.stopPropagation();addToCart(\''+h.id+'\')" data-id="'+h.id+'">'+esc(gramajeLabel(h))+'</button>').join('')+
            '</div>':'';
        let grupoHTML='';
        if(usaSelectorGrupo){
            grupoHTML='<div class="presentacion-wrap pres-pushdown"><button class="pres-arrow pres-arrow-left" onclick="event.stopPropagation();presScroll(this,-1)" aria-label="Anterior" tabindex="-1"><i class="bi bi-chevron-left"></i></button><div class="presentacion-selector" data-grupo="'+p.grupoId+'" onscroll="presUpdateArrows(this)">'+
                miembros.map(m=>{
                    const lbl=m.grupoMascara||m.gramaje||m.nombre;
                    const act=m.id===p.id?' active':'';
                    return '<button class="presentacion-seg'+act+'" onclick="event.stopPropagation();selectGrupoMiembro(\''+p.id+'\',\''+m.id+'\')" data-id="'+m.id+'">'+esc(lbl)+'</button>';
                }).join('')+
                '</div><button class="pres-arrow pres-arrow-right" onclick="event.stopPropagation();presScroll(this,1)" aria-label="Siguiente" tabindex="-1"><i class="bi bi-chevron-right"></i></button></div>';
            /* Precargar imágenes de las otras presentaciones (diferido) para que el cambio sea instantáneo */
            if('requestIdleCallback' in window){
                requestIdleCallback(()=>{miembros.forEach(m=>{if(m.id!==p.id&&m.imagen){const im=new Image();im.src=optImg(m.imagen,500)||m.imagen;}});});
            }else{
                setTimeout(()=>{miembros.forEach(m=>{if(m.id!==p.id&&m.imagen){const im=new Image();im.src=optImg(m.imagen,500)||m.imagen;}});},1500);
            }
        }
        const dscPct=Math.min(100,Math.max(0,p.descuento||0));
        const nombreDisplay=p.nombreMostrado||p.nombre;
        const badgeDesc=dscPct>0?'<span class="product-discount-ribbon">-'+(p.descuento||0)+'%</span>':'';
        const precioConDesc=dscPct>0?Math.round(p.precio*(1-dscPct/100)):p.precio;
        const precioHtml=dscPct>0
            ?'<span class="product-price product-price-off" onclick="openProductDetailModal(\''+p.id+'\')" style="cursor:pointer"><span class="price-original">$'+formatPrice(p.precio)+'</span> $'+formatPrice(precioConDesc)+'</span>'
            :'<span class="product-price" onclick="openProductDetailModal(\''+p.id+'\')" style="cursor:pointer">$'+formatPrice(p.precio)+'</span>';
        return '<article class="product-card" data-id="'+p.id+'"'+(p.grupoId?' data-grupo="'+p.grupoId+'" data-selected="'+p.id+'"':'')+'>' +
            '<div class="product-image" onclick="openProductDetailModal(\''+p.id+'\')" style="cursor:pointer">' +
            badgeDesc +
            '<div class="img-skeleton"></div>' +
            '<img src="'+esc(img)+'" alt="'+esc(nombreDisplay)+'" loading="lazy" decoding="async" onload="this.style.opacity=1;this.previousElementSibling.style.display=\'none\'" onerror="if(this.dataset.orig&&this.src!==this.dataset.orig){this.src=this.dataset.orig;}else{this.src=\'img/default-product.jpg\';}this.style.opacity=1;this.previousElementSibling.style.display=\'none\'" data-orig="'+esc(p.imagen||'')+'" style="opacity:0;transition:opacity 0.3s">' +
            (noStock?'<span class="product-stock out">Sin stock</span>':'') +
            '</div>' +
            '<div class="product-info">' +
            '<h3 class="product-name" onclick="openProductDetailModal(\''+p.id+'\')" style="cursor:pointer">'+esc(nombreDisplay)+'</h3>' +
            '<div class="product-footer">' +
            precioHtml +
            '</div>' +
            grupoHTML+
            '<'+atcTag+' '+atcAttrs+'>' +
            btnContent +
            '</'+atcTag+'>' +
            gramajeHTML+
            '</div></article>';
    }).join('');
    /* Inicializar las flechas de scroll de los selectores de presentación */
    requestAnimationFrame(presInitArrows);
    scrollAnimProductos();
}

// === CARRITO ===
function initCart() {
    try{const saved=localStorage.getItem('yercoCart'); if(saved){carrito=JSON.parse(saved);updateCartUI();}}catch(e){carrito=[];console.warn('No se pudo cargar el carrito:',e);}
    document.getElementById('cartToggle')?.addEventListener('click',openCart);
    document.getElementById('cartClose')?.addEventListener('click',closeCart);
    document.getElementById('cartOverlay')?.addEventListener('click',closeCart);
    document.getElementById('browseProductsBtn')?.addEventListener('click',()=>closeCart());
    document.getElementById('goToCartBtn')?.addEventListener('click',()=>openCart());
    document.getElementById('checkoutBtn')?.addEventListener('click',checkout);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCart();});
}
function openCart(){document.getElementById('cartSidebar')?.classList.add('show');document.getElementById('cartOverlay')?.classList.add('show');document.body.style.overflow='hidden';}
function closeCart(){document.getElementById('cartSidebar')?.classList.remove('show');document.getElementById('cartOverlay')?.classList.remove('show');document.body.style.overflow='';}

function updateProductQuantity(id,ch) {
    if(!clienteAuth&&ch>0){requireLoginToBuy();return;}
    const p=productos.find(x=>x.id===id); if(!p)return;
    let idx=carrito.findIndex(i=>i.id===id);
    if(idx===-1&&ch>0){carrito.push({id:p.id,nombre:p.nombreMostrado||p.nombre,precio:precioFinal(p),precioOriginal:p.precio||0,descuento:Math.min(100,Math.max(0,p.descuento||0)),imagen:p.imagen,cantidad:1});showToast((p.nombreMostrado||p.nombre)+' agregado','success');}
    else if(idx!==-1){const nq=carrito[idx].cantidad+ch;if(nq<=0){carrito.splice(idx,1);showToast((p.nombreMostrado||p.nombre)+' eliminado','info');}else if(nq<=p.stock){carrito[idx].cantidad=nq;}else{showToast('Stock máximo','error');return;}}
    saveCart();updateCartUI();updateProductCard(id);
}
function requireLoginToBuy(){
    showToast('Iniciá sesión para agregar productos','info');
    /* Marcar que venía a comprar - al volver del login (redirect en móvil) se abre el carrito */
    try{sessionStorage.setItem('_intentoCompra','1');}catch(e){}
    /* Abrir el login directamente */
    if(typeof authLogin==='function')authLogin();
}
/* Cambia la card del grupo para mostrar el producto (presentación) seleccionado: título, imagen, precio y botón Agregar */
/* Desplaza el selector de presentaciones al tocar una flecha */
function presScroll(btn, dir){
    const wrap=btn.closest('.presentacion-wrap');
    if(!wrap)return;
    const sel=wrap.querySelector('.presentacion-selector');
    if(!sel)return;
    sel.scrollBy({left:dir*Math.max(120,sel.clientWidth*0.6),behavior:'smooth'});
}
/* Muestra/oculta las flechas según haya contenido para scrollear a cada lado */
function presUpdateArrows(sel){
    const wrap=sel.closest('.presentacion-wrap');
    if(!wrap)return;
    const izq=wrap.querySelector('.pres-arrow-left');
    const der=wrap.querySelector('.pres-arrow-right');
    /* Medir overflow de forma robusta: primero quitar has-overflow para medir en modo "reparto",
       luego decidir. Umbral de 8px para evitar falsos positivos por redondeo. */
    wrap.classList.remove('has-overflow');
    const hayOverflow=sel.scrollWidth>sel.clientWidth+8;
    if(!hayOverflow){
        if(izq)izq.classList.remove('visible');
        if(der)der.classList.remove('visible');
        return;
    }
    wrap.classList.add('has-overflow');
    const atStart=sel.scrollLeft<=2;
    const atEnd=sel.scrollLeft>=sel.scrollWidth-sel.clientWidth-2;
    if(izq)izq.classList.toggle('visible',!atStart);
    if(der)der.classList.toggle('visible',!atEnd);
}
/* Inicializa las flechas de todos los selectores visibles (tras render) */
function presInitArrows(){
    document.querySelectorAll('.presentacion-selector').forEach(sel=>presUpdateArrows(sel));
}
/* Construye el HTML interno del botón Agregar / stepper de cantidad para un producto.
   Unifica la lógica usada en el render inicial y en las actualizaciones. */
function _buildAtcInner(prodId, qty, noStock, maxOut){
    if(noStock){
        return '<span class="atc-text"><i class="bi bi-x-circle"></i> Sin stock</span>';
    }
    if(qty===0){
        return '<span class="atc-text"><i class="bi bi-cart-plus"></i> Agregar</span>';
    }
    return '<span class="atc-qty-wrap"><button class="atc-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+prodId+'\',-1)"><i class="bi bi-dash"></i></button><span class="atc-qty-num">'+qty+'</span><button class="atc-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+prodId+'\',1)"'+(maxOut?' disabled':'')+'><i class="bi bi-plus"></i></button></span>';
}
/* Reemplaza el botón Agregar de una card por el estado correcto (Agregar o stepper)
   para el producto/presentación indicado. Devuelve el nuevo elemento. */
function _setAtcButton(card, prodId, qty, noStock, maxOut){
    const oldEl=card.querySelector('.add-to-cart-btn');
    if(!oldEl)return null;
    const newTag=qty>0?'div':'button';
    const newEl=document.createElement(newTag);
    newEl.className='add-to-cart-btn'+(qty>0?' added':'');
    if(newTag==='button'){
        newEl.disabled=noStock;
        newEl.setAttribute('onclick', noStock?'event.stopPropagation()':(qty===0?'addToCart(\''+prodId+'\')':'event.stopPropagation()'));
    }
    newEl.innerHTML=_buildAtcInner(prodId, qty, noStock, maxOut);
    oldEl.parentNode.replaceChild(newEl, oldEl);
    return newEl;
}
function selectGrupoMiembro(cardId, miembroId){
    const card=document.querySelector('.product-card[data-id="'+cardId+'"]');
    if(!card)return;
    const m=productos.find(x=>x.id===miembroId);
    if(!m)return;
    /* Actualizar botones activos */
    card.querySelectorAll('.presentacion-seg').forEach(b=>{
        b.classList.toggle('active', b.getAttribute('data-id')===miembroId);
    });
    /* Título */
    const h3=card.querySelector('.product-name');
    if(h3)h3.textContent=m.nombreMostrado||m.nombre;
    /* Imagen: precargar y cambiar con fade suave para evitar el parpadeo */
    const imgEl=card.querySelector('.product-image img');
    if(imgEl){
        const nuevaImg=optImg(m.imagen,500)||m.imagen||'img/default-product.jpg';
        imgEl.alt=m.nombreMostrado||m.nombre;
        imgEl.setAttribute('data-orig',m.imagen||'');
        /* Si es la misma imagen, no hacer nada */
        if(imgEl.src!==nuevaImg && !imgEl.src.endsWith(nuevaImg)){
            const skel=card.querySelector('.img-skeleton');
            if(skel)skel.style.display='none';
            const pre=new Image();
            pre.onload=()=>{imgEl.style.opacity='0';setTimeout(()=>{imgEl.src=nuevaImg;imgEl.style.opacity='1';},120);};
            pre.onerror=()=>{imgEl.src=m.imagen||'img/default-product.jpg';imgEl.style.opacity='1';};
            pre.src=nuevaImg;
        }
    }
    /* Cinta de descuento */
    const imgWrap=card.querySelector('.product-image');
    let ribbon=imgWrap?imgWrap.querySelector('.product-discount-ribbon'):null;
    const dsc=Math.min(100,Math.max(0,m.descuento||0));
    if(imgWrap){
        if(dsc>0){
            if(!ribbon){ribbon=document.createElement('span');ribbon.className='product-discount-ribbon';imgWrap.insertBefore(ribbon,imgWrap.firstChild);}
            ribbon.textContent='-'+dsc+'%';
        }else if(ribbon){ribbon.remove();}
    }
    /* Categoría */
    const catEl=card.querySelector('.product-category');
    if(catEl)catEl.textContent=m.categoria+(m.subcategoria?' - '+m.subcategoria:'');
    /* Precio */
    const footer=card.querySelector('.product-footer');
    if(footer){
        const precioConDesc=dsc>0?Math.round(m.precio*(1-dsc/100)):m.precio;
        footer.innerHTML=dsc>0
            ?'<span class="product-price product-price-off" style="cursor:pointer"><span class="price-original">$'+formatPrice(m.precio)+'</span> $'+formatPrice(precioConDesc)+'</span>'
            :'<span class="product-price" style="cursor:pointer">$'+formatPrice(m.precio)+'</span>';
    }
    /* Botón Agregar / stepper: reflejar el estado del MIEMBRO seleccionado en el carrito */
    const ciMiembro=carrito.find(i=>i.id===miembroId);
    const qtyMiembro=ciMiembro?ciMiembro.cantidad:0;
    const noStockM=m.stock===0;
    const maxOutM=qtyMiembro>=m.stock;
    _setAtcButton(card, miembroId, qtyMiembro, noStockM, maxOutM);
    /* Que el click en imagen/título/precio abra el detalle del miembro seleccionado */
    if(imgWrap)imgWrap.onclick=()=>openProductDetailModal(miembroId);
    if(h3)h3.onclick=()=>openProductDetailModal(miembroId);
    /* Guardar el miembro seleccionado en la card para referencia */
    card.setAttribute('data-selected', miembroId);
    /* Asegurar que el botón seleccionado quede visible en el scroll y actualizar flechas */
    const segActivo=card.querySelector('.presentacion-seg.active');
    if(segActivo&&segActivo.scrollIntoView){
        try{segActivo.scrollIntoView({inline:'nearest',block:'nearest',behavior:'smooth'});}catch(e){}
    }
    const selEl=card.querySelector('.presentacion-selector');
    if(selEl)setTimeout(()=>presUpdateArrows(selEl),350);
}
function addToCart(id) {
    if(!clienteAuth){requireLoginToBuy();return;}
    const p=productos.find(x=>x.id===id); if(!p||p.stock===0)return;
    const existing=carrito.find(i=>i.id===id);
    if(existing){
        if(existing.cantidad<p.stock){existing.cantidad++;}else{showToast('Stock máximo','error');return;}
    }else{
        carrito.push({id:p.id,nombre:p.nombreMostrado||p.nombre,precio:precioFinal(p),precioOriginal:p.precio||0,descuento:Math.min(100,Math.max(0,p.descuento||0)),imagen:p.imagen,cantidad:1});
        showToast((p.nombreMostrado||p.nombre)+' agregado','success');
    }
    saveCart();updateCartUI();updateProductCard(id);
}
function updateProductCard(id) {
    const p=productos.find(x=>x.id===id);if(!p)return;
    /* Buscar la card directamente por su id (caso producto suelto o principal de grupo) */
    let card=document.querySelector('.product-card[data-id="'+id+'"]');
    /* Si no se encontró, el producto puede ser un MIEMBRO de un grupo: la card tiene
       el data-id del principal. Buscar la card cuyo principal comparta el grupoId. */
    if(!card && p.grupoId){
        const cards=document.querySelectorAll('.product-card[data-grupo="'+p.grupoId+'"]');
        if(cards.length)card=cards[0];
    }
    if(!card)return;
    /* Solo actualizar el botón si la presentación actualmente mostrada en la card es este id.
       Si la card muestra otra presentación del grupo, no tocamos su botón. */
    const mostrado=card.getAttribute('data-selected')||card.getAttribute('data-id');
    if(mostrado!==id)return;
    const ci=carrito.find(i=>i.id===id),qty=ci?ci.cantidad:0;
    const noStock=p.stock===0;
    const maxOut=qty>=p.stock;
    _setAtcButton(card, id, qty, noStock, maxOut);
}
function updateCartItemQuantity(id,ch){const p=productos.find(x=>x.id===id),idx=carrito.findIndex(i=>i.id===id);if(idx===-1)return;const stock=p?p.stock:carrito[idx].cantidad;const nq=carrito[idx].cantidad+ch;if(nq<=0)removeFromCart(id);else if(nq<=stock){carrito[idx].cantidad=nq;saveCart();updateCartUI();updateProductCard(id);}else showToast('Stock máximo: '+stock,'error');}
function removeFromCart(id){const idx=carrito.findIndex(i=>i.id===id);if(idx!==-1){const nm=carrito[idx].nombre;carrito.splice(idx,1);showToast(nm+' eliminado','info');saveCart();updateCartUI();updateProductCard(id);}}
function saveCart(){try{localStorage.setItem('yercoCart',JSON.stringify(carrito));}catch(e){console.warn('No se pudo guardar el carrito:',e);}}

/* Sincroniza el carrito guardado con los productos actuales:
   - actualiza precio, nombre, imagen, descuento al valor actual
   - marca productos que ya no están disponibles (ocultos, eliminados o sin stock)
   - ajusta cantidades que superan el stock disponible
   Devuelve un array con los cambios detectados para avisar al usuario. */
function reconciliarCarrito(){
    if(!carrito.length||!productos.length)return [];
    const cambios=[];
    carrito.forEach(item=>{
        const p=productos.find(x=>x.id===item.id);
        if(!p){
            /* Producto eliminado u oculto (productos solo tiene los visibles) */
            item._noDisponible=true;
            item._motivo='no_disponible';
            cambios.push({nombre:item.nombre,tipo:'no_disponible'});
            return;
        }
        item._noDisponible=false;
        item._motivo=null;
        /* Actualizar datos al valor actual */
        const precioActual=precioFinal(p);
        if(item.precio!==precioActual){cambios.push({nombre:p.nombreMostrado||p.nombre,tipo:'precio',anterior:item.precio,nuevo:precioActual});}
        item.nombre=p.nombreMostrado||p.nombre;
        item.precio=precioActual;
        item.precioOriginal=p.precio||0;
        item.descuento=Math.min(100,Math.max(0,p.descuento||0));
        item.imagen=p.imagen;
        /* Stock */
        if(p.stock<=0){
            item._sinStock=true;
            cambios.push({nombre:item.nombre,tipo:'sin_stock'});
        }else{
            item._sinStock=false;
            if(item.cantidad>p.stock){
                cambios.push({nombre:item.nombre,tipo:'stock_ajustado',nuevo:p.stock});
                item.cantidad=p.stock;
            }
        }
    });
    saveCart();
    return cambios;
}

/* Muestra un aviso al usuario sobre los cambios detectados en su carrito al volver */
function avisarCambiosCarrito(cambios){
    const noDisp=cambios.filter(c=>c.tipo==='no_disponible').length;
    const sinStock=cambios.filter(c=>c.tipo==='sin_stock').length;
    const precios=cambios.filter(c=>c.tipo==='precio').length;
    const stockAjust=cambios.filter(c=>c.tipo==='stock_ajustado').length;
    let msgs=[];
    if(noDisp)msgs.push(noDisp+' producto'+(noDisp>1?'s no disponibles':' no disponible')+' temporalmente');
    if(sinStock)msgs.push(sinStock+' producto'+(sinStock>1?'s sin':' sin')+' stock');
    if(stockAjust)msgs.push('cantidades ajustadas por stock');
    if(precios)msgs.push('precios actualizados');
    if(msgs.length){
        showToast('Tu carrito se actualizó: '+msgs.join(', '),'info');
    }
}
function clearCart(){if(carrito.length===0)return;if(!confirm('Vaciar todo el carrito?'))return;const ids=carrito.map(i=>i.id);carrito=[];saveCart();updateCartUI();ids.forEach(id=>updateProductCard(id));showToast('Carrito vaciado','info');}

let _pdmCurrentImgIdx=0;
let _pdmImages=[];
/* Abre el producto correspondiente al slug de la URL (al entrar directo por /producto/xxx) */
function abrirProductoDesdeURL(){
    const path=window.location.pathname;
    if(!path.startsWith('/producto/'))return;
    const slug=decodeURIComponent(path.replace('/producto/','').replace(/\/$/,''));
    if(!slug)return;
    const p=productos.find(x=>x.slug===slug);
    if(!p){
        showToast('Producto no encontrado','error');
        history.replaceState({},'','/');
        return;
    }
    /* Esperar a que el grid esté renderizado, luego abrir */
    setTimeout(()=>{
        openProductDetailModal(p.id);
        /* Scroll a la sección de productos */
        const s=document.getElementById('productos');
        if(s)s.scrollIntoView({behavior:'instant',block:'start'});
    },300);
}
function openProductDetailModal(id){
    const p=productos.find(x=>x.id===id);if(!p)return;
    /* Actualizar la URL del navegador a /producto/{slug} (sin recargar) */
    if(p.slug){
        const nuevaUrl='/producto/'+p.slug;
        if(window.location.pathname!==nuevaUrl){
            history.pushState({productId:id},'',nuevaUrl);
        }
    }
    /* Construir lista de imagenes: imagen principal + imagenesExtra (del admin) */
    const imgsArr=[];
    if(p.imagen)imgsArr.push(p.imagen);
    if(Array.isArray(p.imagenesExtra))p.imagenesExtra.forEach(u=>{if(u&&!imgsArr.includes(u))imgsArr.push(u);});
    /* Compat con campo viejo "imagenes" si existiera */
    if(Array.isArray(p.imagenes))p.imagenes.forEach(u=>{if(u&&!imgsArr.includes(u))imgsArr.push(u);});
    _pdmImages=imgsArr;
    _pdmCurrentImgIdx=0;
    const ci=carrito.find(i=>i.id===id),qty=ci?ci.cantidad:0;
    const noStock=p.stock===0;
    const maxOut=qty>=p.stock;
    const imgsHtml=_pdmImages.length?_pdmImages.map((url,i)=>'<img src="'+esc(optImg(url,800)||url)+'" class="pdm-img'+(i===0?' active':'')+'" data-idx="'+i+'" alt="'+esc(p.nombre)+'" data-orig="'+esc(url||'')+'" onerror="if(this.dataset.orig&&this.src!==this.dataset.orig){this.src=this.dataset.orig;}else{this.src=\'img/default-product.jpg\';}">').join(''):'<div class="pdm-img-placeholder"><i class="bi bi-image"></i> Sin imagen</div>';
    const carouselNav=_pdmImages.length>1?'<button class="pdm-carousel-btn pdm-prev" onclick="pdmCarouselNav(-1)"><i class="bi bi-chevron-left"></i></button><button class="pdm-carousel-btn pdm-next" onclick="pdmCarouselNav(1)"><i class="bi bi-chevron-right"></i></button><div class="pdm-carousel-dots">'+_pdmImages.map((_,i)=>'<span class="pdm-dot'+(i===0?' active':'')+'" onclick="pdmCarouselGoTo('+i+')"></span>').join('')+'</div>':'';
    let btnContent;
    if(noStock){btnContent='<i class="bi bi-x-circle"></i> Sin stock';}
    else if(qty===0){btnContent='<i class="bi bi-cart-plus"></i> Agregar al carrito';}
    else{btnContent='<span class="pdm-qty-wrap"><button class="pdm-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+id+'\',-1);refreshProductDetailModal(\''+id+'\')"><i class="bi bi-dash"></i></button><span class="pdm-qty-num">'+qty+'</span><button class="pdm-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+id+'\',1);refreshProductDetailModal(\''+id+'\')"'+(maxOut?' disabled':'')+'><i class="bi bi-plus"></i></button></span>';}
    const desc=p.descripcion||'';
    const vn=p.valoresNutricionales||p.infoNutricional||p.tablaNutricional||'';
    const nombreDisplay=p.nombreMostrado||p.nombre;
    const dscPct=Math.min(100,Math.max(0,p.descuento||0));
    const precioRowHtml=dscPct>0
        ?'<div class="pdm-price-row"><span class="pdm-price product-price-off">$'+formatPrice(Math.round(p.precio*(1-dscPct/100)))+'</span><span class="price-original" style="font-size:1rem">$'+formatPrice(p.precio)+'</span><span style="background:linear-gradient(135deg,#e6a23c,#d97706);color:#fff;font-size:0.72rem;font-weight:800;padding:2px 8px;border-radius:6px;margin-left:6px">-'+(p.descuento||0)+'% OFF</span>'+(noStock?'<span class="pdm-stock-tag">Sin stock</span>':'')+'</div>'
        :'<div class="pdm-price-row"><span class="pdm-price">$'+formatPrice(p.precio)+'</span>'+(noStock?'<span class="pdm-stock-tag">Sin stock</span>':'')+'</div>';
    /* Grupos de presentación: botones que cambian de producto en el modal.
       Igual que en la tarjeta, se resuelve primero porque decide si el sistema
       viejo de gramajes se dibuja. Antes se concatenaban los dos y salían DOS
       secciones "Presentaciones" seguidas. */
    const pdmMiembros=p.grupoId?productos.filter(m=>m.grupoId===p.grupoId).sort((a,b)=>(a.grupoOrden??999)-(b.grupoOrden??999)):[];
    const pdmUsaGrupo=pdmMiembros.length>1;
    let pdmGrupoHtml='';
    if(pdmUsaGrupo){
        pdmGrupoHtml='<div class="pdm-section"><h4>Presentaciones</h4><div class="presentacion-selector">'+
            pdmMiembros.map(m=>{
                const lbl=m.grupoMascara||m.gramaje||m.nombre;
                const act=m.id===p.id?' active':'';
                return '<button class="presentacion-seg'+act+'" onclick="openProductDetailModal(\''+m.id+'\')">'+esc(lbl)+'</button>';
            }).join('')+
            '</div></div>';
    }
    /* Gramajes asociados (sistema viejo): solo si el grupo no se hizo cargo */
    const pdmHijos=pdmUsaGrupo?[]:productos.filter(h=>h.gramajePadreId===p.id);
    const pdmGramajeHtml=pdmHijos.length>0?'<div class="pdm-section"><h4>Presentaciones</h4><div class="gramaje-btns">'+
        '<button class="gramaje-btn active" onclick="addToCart(\''+p.id+'\');showToast(\''+esc((p.nombreMostrado||p.nombre)).replace(/'/g,"")+'\'+\' agregado\',\'success\')">'+esc(p.gramaje||'Base')+'</button>'+
        pdmHijos.map(h=>'<button class="gramaje-btn" onclick="addToCart(\''+h.id+'\');showToast(\'Agregado\',\'success\')">'+esc(gramajeLabel(h))+'</button>').join('')+
        '</div></div>':'';
    document.getElementById('productDetailBody').innerHTML=
        '<div class="pdm-carousel">'+imgsHtml+carouselNav+'</div>'+
        '<div class="pdm-info">'+
        '<div class="pdm-cat">'+esc(p.categoria||'')+(p.subcategoria?' &middot; '+esc(p.subcategoria):'')+'</div>'+
        '<h2 class="pdm-name">'+esc(nombreDisplay)+'</h2>'+
        precioRowHtml+
        pdmGramajeHtml+
        pdmGrupoHtml+
        (desc?'<div class="pdm-section"><h4>Descripción</h4><p>'+esc(desc).replace(/\n/g,'<br>')+'</p></div>':'')+
        (vn?'<div class="pdm-section"><h4>Información nutricional</h4><div class="pdm-nutritional">'+esc(vn).replace(/\n/g,'<br>')+'</div></div>':'')+
        (!desc&&!vn?'<div class="pdm-section pdm-no-info"><i class="bi bi-info-circle"></i> Próximamente más información sobre este producto</div>':'')+
        (qty===0||noStock?'<button class="pdm-add-btn'+(noStock?' disabled':'')+'" id="pdmAddBtn-'+id+'" onclick="'+(qty===0&&!noStock?'addToCart(\''+id+'\');refreshProductDetailModal(\''+id+'\')'  :'event.stopPropagation()')+'"'+(noStock?' disabled':'')+'>'+btnContent+'</button>':'<div class="pdm-add-btn added" id="pdmAddBtn-'+id+'">'+btnContent+'</div>')+
        '</div>';
    const footerEl=document.getElementById('productDetailFooter');
    const btnEl=document.getElementById('productDetailBody').querySelector('.pdm-add-btn');
    if(btnEl&&footerEl){footerEl.innerHTML='';footerEl.appendChild(btnEl);}
    document.getElementById('productDetailModal').classList.add('show');
    document.getElementById('productDetailOverlay').classList.add('show');
    document.body.style.overflow='hidden';
}
function refreshProductDetailModal(id){
    /* Solo actualizar el boton (no re-renderizar todo el modal para evitar bugs y perder handlers) */
    const p=productos.find(x=>x.id===id);if(!p)return;
    const btnEl=document.getElementById('pdmAddBtn-'+id)||(document.getElementById('productDetailFooter')&&document.getElementById('productDetailFooter').querySelector('#pdmAddBtn-'+id));
    if(!btnEl)return;
    const ci=carrito.find(i=>i.id===id),qty=ci?ci.cantidad:0;
    const noStock=p.stock===0;
    const maxOut=qty>=p.stock;
    let btnContent,newEl;
    if(noStock){
        btnContent='<i class="bi bi-x-circle"></i> Sin stock';
        newEl='<button class="pdm-add-btn" id="pdmAddBtn-'+id+'" onclick="event.stopPropagation()" disabled>'+btnContent+'</button>';
    }else if(qty===0){
        btnContent='<i class="bi bi-cart-plus"></i> Agregar al carrito';
        newEl='<button class="pdm-add-btn" id="pdmAddBtn-'+id+'" onclick="addToCart(\''+id+'\');refreshProductDetailModal(\''+id+'\')">' +btnContent+'</button>';
    }else{
        btnContent='<span class="pdm-qty-wrap"><button class="pdm-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+id+'\',-1);refreshProductDetailModal(\''+id+'\')"><i class="bi bi-dash"></i></button><span class="pdm-qty-num">'+qty+'</span><button class="pdm-qty-btn" onclick="event.stopPropagation();updateProductQuantity(\''+id+'\',1);refreshProductDetailModal(\''+id+'\')"'+(maxOut?' disabled':'')+'><i class="bi bi-plus"></i></button></span>';
        newEl='<div class="pdm-add-btn added" id="pdmAddBtn-'+id+'">'+btnContent+'</div>';
    }
    btnEl.outerHTML=newEl;
}
function closeProductDetailModal(){
    document.getElementById('productDetailModal')?.classList.remove('show');
    document.getElementById('productDetailOverlay')?.classList.remove('show');
    document.body.style.overflow='';
    /* Volver la URL a la raíz si estábamos en una URL de producto */
    if(window.location.pathname.startsWith('/producto/')){
        history.pushState({},'','/');
    }
}
function pdmCarouselNav(delta){
    if(!_pdmImages.length)return;
    _pdmCurrentImgIdx=(_pdmCurrentImgIdx+delta+_pdmImages.length)%_pdmImages.length;
    pdmCarouselGoTo(_pdmCurrentImgIdx);
}
function pdmCarouselGoTo(idx){
    if(!_pdmImages.length)return;
    _pdmCurrentImgIdx=idx;
    document.querySelectorAll('.pdm-img').forEach((el,i)=>el.classList.toggle('active',i===idx));
    document.querySelectorAll('.pdm-dot').forEach((el,i)=>el.classList.toggle('active',i===idx));
}
document.addEventListener('keydown',e=>{
    if(!document.getElementById('productDetailModal')?.classList.contains('show'))return;
    if(e.key==='Escape')closeProductDetailModal();
    else if(e.key==='ArrowLeft')pdmCarouselNav(-1);
    else if(e.key==='ArrowRight')pdmCarouselNav(1);
});

function updateCartUI() {
    const body=document.getElementById('cartBody'),empty=document.getElementById('cartEmpty'),footer=document.getElementById('cartFooter'),count=document.getElementById('cartCount'),total=document.getElementById('cartTotal'),cta=document.getElementById('ctaCartCount'),ckBtn=document.getElementById('checkoutBtn');
    const ti=carrito.reduce((s,i)=>(i._noDisponible||i._sinStock)?s:s+i.cantidad,0),tp=carrito.reduce((s,i)=>(i._noDisponible||i._sinStock)?s:s+(i.precio*i.cantidad),0);
    if(count)count.textContent=ti;if(cta)cta.textContent=ti;if(total)total.textContent='$'+formatPrice(tp);
    if(carrito.length===0){if(empty)empty.style.display='block';if(footer)footer.style.display='none';body?.querySelectorAll('.cart-item').forEach(i=>i.remove());}
    else{if(empty)empty.style.display='none';if(footer){footer.style.display='';footer.style.removeProperty('display');}renderCartItems();}
    if(ckBtn){const min=negMinimo();ckBtn.disabled=carrito.length===0||tp<min;if(min>0&&tp>0&&tp<min){ckBtn.innerHTML='<i class="bi bi-bag-check"></i> Mínimo $'+formatPrice(min);}else{ckBtn.innerHTML='<i class="bi bi-bag-check"></i> Confirmar';}}
    updateShippingBar(tp);
}
function renderCartItems() {
    const body=document.getElementById('cartBody'),empty=document.getElementById('cartEmpty');if(!body)return;
    body.querySelectorAll('.cart-item').forEach(i=>i.remove());
    carrito.forEach(item=>{
        const p=productos.find(x=>x.id===item.id);
        const ms=p?p.stock:0;
        const noDisp=item._noDisponible||!p;
        const sinStock=item._sinStock||(p&&p.stock<=0);
        const problema=noDisp||sinStock;
        const avisoHtml=noDisp?'<span class="cart-item-warning">No disponible temporalmente</span>':(sinStock?'<span class="cart-item-warning">Sin stock</span>':'');
        const el=document.createElement('div');
        el.className='cart-item'+(problema?' cart-item-problema':'');
        if(problema){
            el.innerHTML='<img src="'+esc(optImg(item.imagen,200)||'img/default-product.jpg')+'" alt="'+esc(item.nombre)+'" class="cart-item-image" style="opacity:0.5"><div class="cart-item-info"><h4 class="cart-item-name">'+esc(item.nombre)+'</h4>'+avisoHtml+'<div class="cart-item-controls"><button class="cart-item-remove" onclick="removeFromCart(\''+item.id+'\')" style="margin-left:0"><i class="bi bi-trash"></i> Quitar</button></div></div>';
        }else{
            el.innerHTML='<img src="'+esc(optImg(item.imagen,200)||'img/default-product.jpg')+'" alt="'+esc(item.nombre)+'" class="cart-item-image"><div class="cart-item-info"><h4 class="cart-item-name">'+esc(item.nombre)+'</h4><span class="cart-item-price">$'+formatPrice(item.precio)+'</span><div class="cart-item-controls"><button class="qty-btn" onclick="updateCartItemQuantity(\''+item.id+'\',-1)"><i class="bi bi-dash"></i></button><span class="qty-value">'+item.cantidad+'</span><button class="qty-btn" onclick="updateCartItemQuantity(\''+item.id+'\',1)"'+(item.cantidad>=ms?' disabled':'')+'><i class="bi bi-plus"></i></button><button class="cart-item-remove" onclick="removeFromCart(\''+item.id+'\')"><i class="bi bi-trash"></i></button></div></div>';
        }
        body.insertBefore(el,empty);
    });
}

/* ===== CONFIGURACION DEL NEGOCIO (config/pedidos) =====
   El panel guarda ahi haceEnvios / minimoPedido / envioPrecio / envioGratisActivo /
   envioGratisDesde, y hasta ahora la tienda no lo leia: tenia esos mismos numeros
   escritos a mano. Coincidian con los defaults del panel, asi que no se notaba; el
   desfasaje empezaba el dia que el comercio guardara ese formulario, porque el
   cliente iba a seguir viendo el minimo y el envio viejos, y podia pedir envio a
   domicilio con los envios apagados.
   Se lee sin bloquear el render: se pinta con lo cacheado de la visita anterior (o
   con los defaults) y se repinta cuando responde Firestore, igual que siteContent. */
const NEG_DEFAULTS={haceEnvios:true,minimoPedido:30000,envioPrecio:2000,envioGratisActivo:true,envioGratisDesde:100000};
const NEG_CACHE_KEY='yerco_negocio_v1';
let NEGOCIO=Object.assign({},NEG_DEFAULTS);
function negMinimo(){return Math.max(0,Number(NEGOCIO.minimoPedido)||0);}
function negEnvioPrecio(){return NEGOCIO.haceEnvios?Math.max(0,Number(NEGOCIO.envioPrecio)||0):0;}
/* Infinity = no hay meta de envio gratis que perseguir (envios apagados o promo apagada) */
function negEnvioGratisDesde(){return (NEGOCIO.haceEnvios&&NEGOCIO.envioGratisActivo)?Math.max(0,Number(NEGOCIO.envioGratisDesde)||0):Infinity;}
function negTipoEntrega(){return NEGOCIO.haceEnvios?(window._chkTipoEntrega==='retiro'?'retiro':'envio'):'retiro';}
function negCostoEnvio(subtotal){return negTipoEntrega()==='retiro'?0:(subtotal>=negEnvioGratisDesde()?0:negEnvioPrecio());}
/* Abrevia un monto para los marcadores de la barra: 30000 -> "30k" */
function negMontoCorto(n){n=Math.round(Number(n)||0);return n>=1000?String(Math.round(n/100)/10).replace('.',',')+'k':String(n);}
function negNormalizar(d){
    if(!d||typeof d!=='object')return null;
    const b=k=>typeof d[k]==='boolean'?d[k]:NEG_DEFAULTS[k];
    const n=k=>{const v=Number(d[k]);return isFinite(v)&&v>=0?v:NEG_DEFAULTS[k];};
    return {haceEnvios:b('haceEnvios'),minimoPedido:n('minimoPedido'),envioPrecio:n('envioPrecio'),envioGratisActivo:b('envioGratisActivo'),envioGratisDesde:n('envioGratisDesde')};
}
function negAplicar(d){
    const cfg=negNormalizar(d);
    if(!cfg)return;
    NEGOCIO=cfg;
    aplicarModoEnviosTienda();
    try{updateCartUI();}catch(e){}
    if(document.getElementById('checkoutModal')?.classList.contains('show'))updateCheckoutResumen();
}
/* Con los envios apagados no hay nada que elegir: se esconden la pregunta y los dos
   botones, pero NO la direccion de retiro, que ahi pasa a ser el unico dato util. */
function aplicarModoEnviosTienda(){
    const lbl=document.getElementById('chkEntregaLabel'),tog=document.getElementById('chkEntregaToggle');
    if(lbl)lbl.style.display=NEGOCIO.haceEnvios?'':'none';
    if(tog)tog.style.display=NEGOCIO.haceEnvios?'':'none';
    if(!NEGOCIO.haceEnvios)window._chkTipoEntrega='retiro';
}
async function loadNegocioCfg(){
    try{const raw=localStorage.getItem(NEG_CACHE_KEY);if(raw)negAplicar(JSON.parse(raw));}catch(e){}
    try{
        const snap=await db.collection('config').doc('pedidos').get();
        if(!snap.exists)return;
        negAplicar(snap.data());
        try{localStorage.setItem(NEG_CACHE_KEY,JSON.stringify(NEGOCIO));}catch(e){}
    }catch(e){console.log('Config del negocio no cargada:',e);}
}
loadNegocioCfg();

function updateShippingBar(total) {
    const prog=document.getElementById('shippingProgress'),msg=document.getElementById('shippingMsg'),fill=document.getElementById('shippingBarFill');
    if(!msg||!fill)return;
    const min=negMinimo(),free=negEnvioGratisDesde();
    /* Sin minimo y sin envio gratis no queda ninguna meta que mostrar */
    if(!min&&!isFinite(free)){if(prog)prog.style.display='none';return;}
    if(prog)prog.style.display='';
    /* La barra se escala contra la meta mas lejana, no contra un 100000 fijo */
    const escala=Math.max(min,isFinite(free)?free:0)||1;
    const pct=v=>Math.max(0,Math.min(100,v/escala*100));
    const mMin=document.getElementById('shippingMarkMin'),mFree=document.getElementById('shippingMarkFree');
    if(mMin){if(min>0){mMin.style.display='';mMin.style.left=pct(min)+'%';mMin.textContent=negMontoCorto(min);}else mMin.style.display='none';}
    if(mFree){if(isFinite(free)&&free!==min){mFree.style.display='';mFree.style.left=pct(free)+'%';mFree.textContent=negMontoCorto(free);}else mFree.style.display='none';}
    if(min>0&&total<min){msg.textContent='Faltan $'+formatPrice(min-total)+' para el pedido mínimo ($'+formatPrice(min)+')';msg.className='shipping-msg under-min';fill.style.width=pct(total)+'%';fill.style.background='#c0392b';}
    else if(isFinite(free)&&total<free){msg.textContent='¡Faltan $'+formatPrice(free-total)+' para envío gratis!';msg.className='shipping-msg near-free';fill.style.width=pct(total)+'%';fill.style.background='#e67e22';}
    else if(isFinite(free)){msg.textContent='¡Tenés envío gratis!';msg.className='shipping-msg free-shipping';fill.style.width='100%';fill.style.background='var(--color-primary)';}
    else{msg.textContent='¡Listo para confirmar!';msg.className='shipping-msg free-shipping';fill.style.width='100%';fill.style.background='var(--color-primary)';}
}

function checkout() {
    if(carrito.length===0){showToast('Carrito vacío','error');return;}
    if(!clienteAuth){requireLoginToBuy();return;}
    openCheckoutModal();
}

function openCheckoutModal(){
    /* Comprar exige sesión. Las tres puertas que llegan acá ya lo piden, pero la
       invariante se deja escrita: si alguien entra sin sesión, se pide login en
       vez de mostrar un formulario que Firestore no va a dejar guardar. */
    if (!clienteAuth) { requireLoginToBuy(); return; }
    const datosSection = document.getElementById('chkDatosSection');
    const confirmBtn = document.getElementById('chkConfirmBtn');

    if (datosSection) datosSection.style.display = 'block';
    if (confirmBtn) confirmBtn.style.display = '';

    const wrap = document.getElementById('chkDirGuardadasWrap');
    const sel = document.getElementById('chkDirSelect');
    const nuevaDirWrap = document.getElementById('chkNuevaDirWrap');
    const nomDirWrap = document.getElementById('chkNombreDirWrap');

    {
        const nEl=document.getElementById('chkNombre'),aEl=document.getElementById('chkApellido'),tEl=document.getElementById('chkTelefono');
        if(nEl&&!nEl.value)nEl.value = clienteAuth.nombre || '';
        if(aEl&&!aEl.value)aEl.value = clienteAuth.apellido || '';
        if(tEl&&!tEl.value)tEl.value = clienteAuth.telefono || '';
        /* Cargar direcciones guardadas */
        const dirs = clienteAuth.direcciones || [];
        if (dirs.length) {
            sel.innerHTML = dirs.map((d,i) =>
                `<option value="${i}">${d.nombre} — ${d.texto}</option>`
            ).join('') + '<option value="nueva">+ Nueva dirección...</option>';
            if (wrap) wrap.style.display = 'block';
            if (nuevaDirWrap) nuevaDirWrap.style.display = 'none';
            document.getElementById('chkDireccion').value = dirs[0].texto;
            sel.value = '0';
        } else {
            if (wrap) wrap.style.display = 'none';
            if (nuevaDirWrap) nuevaDirWrap.style.display = 'block';
            if (nomDirWrap) nomDirWrap.style.display = 'block';
        }
    }
    aplicarModoEnviosTienda();
    setCheckoutEntrega(NEGOCIO.haceEnvios?'envio':'retiro');
    /* Limpiar cupón al abrir nuevo checkout */
    quitarCupon();
    updateCheckoutResumen();
    document.getElementById('checkoutOverlay').classList.add('show');
    document.getElementById('checkoutModal').classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('chkNombre')?.focus(), 150);
}

function onSelectDireccion(val) {
    const dirs = clienteAuth?.direcciones || [];
    const input = document.getElementById('chkDireccion');
    const nuevaDirWrap = document.getElementById('chkNuevaDirWrap');
    const nomDirWrap = document.getElementById('chkNombreDirWrap');
    if (val === 'nueva') {
        if (input) input.value = '';
        if (nuevaDirWrap) nuevaDirWrap.style.display = 'block';
        if (nomDirWrap) nomDirWrap.style.display = dirs.length < 5 ? 'block' : 'none';
        const nomDirInput = document.getElementById('chkNombreDir');
        if (nomDirInput) nomDirInput.value = '';
    } else {
        const dir = dirs[parseInt(val)];
        if (dir) {
            if (input) input.value = dir.texto;
        }
        if (nuevaDirWrap) nuevaDirWrap.style.display = 'none';
    }
}

function closeCheckoutModal(){
    document.getElementById('checkoutOverlay')?.classList.remove('show');
    document.getElementById('checkoutModal')?.classList.remove('show');
    document.body.style.overflow='';_cuponAplicado=null;const ci=document.getElementById('chkCuponInput');if(ci)ci.value='';const cm=document.getElementById('chkCuponMsg');if(cm)cm.innerHTML='';
    const btn=document.getElementById('chkConfirmBtn');
    if(btn){btn.disabled=false;btn.innerHTML='<i class="bi bi-whatsapp"></i> Confirmar pedido';}
}

function setCheckoutEntrega(tipo){
    if(!NEGOCIO.haceEnvios)tipo='retiro';
    window._chkTipoEntrega=tipo==='retiro'?'retiro':'envio';
    document.querySelectorAll('.chk-entrega-btn').forEach(b=>{
        b.classList.toggle('active',b.getAttribute('data-tipo')===window._chkTipoEntrega);
    });
    /* Mostrar/ocultar campo direccion segun tipo */
    const dirGroup=document.getElementById('chkDireccionGroup');
    const dirInput=document.getElementById('chkDireccion');
    if(window._chkTipoEntrega==='retiro'){
        if(dirGroup)dirGroup.style.display='none';
        if(dirInput)dirInput.removeAttribute('required');
    }else{
        if(dirGroup)dirGroup.style.display='';
        if(dirInput)dirInput.setAttribute('required','required');
    }
    updateCheckoutResumen();
}

function updateCheckoutResumen(){
    const subtotal=carrito.reduce((s,i)=>s+i.precio*i.cantidad,0);
    const tipoEntrega=negTipoEntrega();
    const dcMonto=_cuponAplicado?Math.min(_cuponAplicado.monto||0,subtotal):0;
    const subtotalConDesc=subtotal-dcMonto;
    const envio=negCostoEnvio(subtotalConDesc);
    const total=subtotalConDesc+envio;
    const el=document.getElementById('chkResumen');
    if(!el)return;
    const envioRow=tipoEntrega==='retiro'
        ?'<div class="chk-resumen-row"><span><i class="bi bi-shop"></i> Retiro en local</span><span style="color:#2d4a22">sin cargo</span></div>'
        :('<div class="chk-resumen-row"><span><i class="bi bi-truck"></i> Envío</span><span'+(envio===0?' style="color:#2d4a22;font-weight:600"':'')+'>'+(envio===0?'GRATIS':'$'+formatPrice(envio))+'</span></div>');
    const cuponRow=_cuponAplicado?'<div class="chk-resumen-row" style="color:#2d6b4a"><span><i class="bi bi-ticket-perforated"></i> Cupón '+_cuponAplicado.codigo+'</span><span>-$'+formatPrice(dcMonto)+'</span></div>':'';
    /* Lista de productos */
    const itemsList = carrito.map(i => {
        const cant = i.cantidad > 1 ? '<span style="background:#e8f5e9;color:#2d4a22;border-radius:10px;padding:1px 7px;font-size:0.75rem;font-weight:700">x'+i.cantidad+'</span> ' : '';
        return '<div class="chk-resumen-item">'+cant+'<span class="chk-resumen-item-name">'+i.nombre+'</span><span>$'+formatPrice(i.precio*i.cantidad)+'</span></div>';
    }).join('');
    el.innerHTML=
        '<div style="margin-bottom:0.5rem;padding-bottom:0.5rem;border-bottom:1px solid #eee">'+itemsList+'</div>'+
        '<div class="chk-resumen-row"><span>Subtotal ('+carrito.length+' '+(carrito.length===1?'producto':'productos')+')</span><span>$'+formatPrice(subtotal)+'</span></div>'+
        envioRow+cuponRow+
        '<div class="chk-resumen-total"><span>TOTAL</span><span>$'+formatPrice(total)+'</span></div>';
}


/* ===== SEGURIDAD - SANITIZACIÓN ===== */
function sanitizeText(val, maxLen) {
    if (!val) return '';
    /* Eliminar caracteres de control y HTML */
    return String(val)
        .replace(/[<>"'`]/g, '')
        .replace(/[\x00-\x1F\x7F]/g, '')
        .trim()
        .slice(0, maxLen || 500);
}
function sanitizePhone(val) {
    if (!val) return '';
    return String(val).replace(/[^0-9+\-\s()]/g, '').trim().slice(0, 30);
}

async function confirmCheckout(){
    /* Validar disponibilidad y stock con datos actuales antes de confirmar */
    const cambiosPrev=reconciliarCarrito();
    const conProblema=carrito.filter(i=>i._noDisponible||i._sinStock);
    if(conProblema.length){
        updateCartUI();
        const nombres=conProblema.map(i=>i.nombre).join(', ');
        showToast('No se puede confirmar: '+nombres+' no disponible'+(conProblema.length>1?'s':'')+' temporalmente. Quitalo'+(conProblema.length>1?'s':'')+' del carrito.','error');
        return;
    }
    /* Si hubo cambios de precio/stock, avisar y dejar que revise antes de seguir */
    if(cambiosPrev.some(c=>c.tipo==='precio'||c.tipo==='stock_ajustado')){
        updateCartUI();
        showToast('Algunos precios o cantidades cambiaron. Revisá tu carrito antes de confirmar.','info');
        return;
    }
    /* Capturar el cupón AHORA, porque closeCheckoutModal() más abajo limpia _cuponAplicado */
    const cuponParaRegistrar = _cuponAplicado ? {..._cuponAplicado} : null;
    /* Si ingresó una nueva dirección con nombre, guardarla en el perfil */
    const nomDirInput = document.getElementById('chkNombreDir');
    const nomDir = sanitizeText(nomDirInput?.value, 60);
    const selDir = document.getElementById('chkDirSelect');
    /* Guardar si: hay nombre, y (no hay select visible O eligió "nueva") */
    const selVisible = selDir && selDir.offsetParent !== null;
    const esNueva = !selVisible || selDir.value === 'nueva';
    if (clienteAuth && nomDir && esNueva) {
        const dirs = clienteAuth.direcciones || [];
        const dirTexto = sanitizeText(document.getElementById('chkDireccion').value, 200);
        if (dirs.length < 5 && dirTexto) {
            dirs.push({ nombre: nomDir, texto: dirTexto });
            try {
                await db.collection('clientesAuth').doc(clienteAuth.uid).update({ direcciones: dirs });
                clienteAuth.direcciones = dirs;
                console.log('Dirección guardada:', nomDir, dirTexto);
            } catch(e) { console.warn('Error guardando dirección:', e); }
        }
    }
    const nombre=sanitizeText(document.getElementById('chkNombre').value, 80);
    const apellido=sanitizeText(document.getElementById('chkApellido').value, 80);
    const telefono=sanitizePhone(document.getElementById('chkTelefono').value);
    const direccion=sanitizeText(document.getElementById('chkDireccion').value, 200);
    const notas=sanitizeText(document.getElementById('chkNotas').value, 500);
    const tipoEntrega=negTipoEntrega();
    /* Validaciones */
    if(!nombre){showToast('Ingresá tu nombre','error');document.getElementById('chkNombre').focus();return;}
    if(!apellido){showToast('Ingresá tu apellido','error');document.getElementById('chkApellido').focus();return;}
    if(!telefono){showToast('Ingresá tu teléfono','error');document.getElementById('chkTelefono').focus();return;}
    const telefonoLimpio=telefono.replace(/\D/g,'');
    if(telefonoLimpio.length<8){showToast('El teléfono debe tener al menos 8 dígitos','error');document.getElementById('chkTelefono').focus();return;}
    if(tipoEntrega==='envio'&&!direccion){showToast('Para envío necesitamos tu dirección','error');document.getElementById('chkDireccion').focus();return;}
    /* Guardar datos en localStorage para próxima vez */
    /* El checkout ya exige nombre, apellido y telefono, pero eso solo iba a
       localStorage: en clientesAuth el cliente seguia figurando "incompleto" en el
       panel por mas pedidos que hiciera. El unico lugar que completaba esos campos
       era el modal "Completa tus datos", que solo aparece justo despues de apretar
       "Iniciar sesion" y nunca al restaurar la sesion. Se completa con lo que la
       persona acaba de escribir, sin pisar lo que ya tenga cargado, y sin frenar el
       pedido si la escritura falla. */
    if(clienteAuth){
        const _faltan={};
        if(!clienteAuth.nombre&&nombre)_faltan.nombre=nombre;
        if(!clienteAuth.apellido&&apellido)_faltan.apellido=apellido;
        if(!clienteAuth.telefono&&telefono)_faltan.telefono=telefono;
        if(Object.keys(_faltan).length){
            try{
                await db.collection('clientesAuth').doc(clienteAuth.uid).update(_faltan);
                Object.assign(clienteAuth,_faltan);
                if(typeof authClient!=='undefined'&&authClient.currentUser)_updateNavAuth(authClient.currentUser);
            }catch(e){console.warn('No se pudieron completar los datos del cliente:',e.message);}
        }
    }
    const btn=document.getElementById('chkConfirmBtn');
    btn.disabled=true;btn.innerHTML='<i class="bi bi-arrow-repeat spin"></i> Confirmando...';
    try{
        if(!firebase||!firebase.firestore){throw new Error('Firebase no inicializado');}
        const db=firebase.firestore();
        const subtotal=carrito.reduce((s,i)=>s+i.precio*i.cantidad,0);
        const dcMonto=cuponParaRegistrar?Math.min(cuponParaRegistrar.monto||0,subtotal):0;
        const subtotalConDesc=subtotal-dcMonto;
        const envio=negCostoEnvio(subtotalConDesc);
        const total=subtotalConDesc+envio;
        const clienteNombreCompleto=nombre+' '+apellido;
        /* Obtener numero de pedido secuencial con transaction atomica */
        let pedidoNum=1;
        const cntRef=db.collection('config').doc('pedidosCount');
        try{
            pedidoNum=await db.runTransaction(async t=>{
                const snap=await t.get(cntRef);
                const next=(snap.exists?(parseInt(snap.data().count)||0):0)+1;
                t.set(cntRef,{count:next});
                return next;
            });
        }catch(e){console.warn('Transaction pedidosCount falló:',e);}
        /* Crear pedido en BDD (NO se toca la coleccion clientes desde la web) */
        const pedido={
            numero:pedidoNum,
            estado:'pendiente',
            cliente:clienteNombreCompleto,
            clienteAuthUid:clienteAuth?clienteAuth.uid:null,
            clienteEmail:clienteAuth?clienteAuth.email:null,
            clienteId:clienteAuth?clienteAuth.clienteId:null,
            telefono:telefonoLimpio,
            direccion:tipoEntrega==='envio'?direccion:null,
            notas:notas||null,
            tipoEntrega:tipoEntrega,
            items:carrito.map(i=>({id:i.id,nombre:i.nombre,precio:i.precio,precioOriginal:i.precioOriginal||i.precio,descuento:i.descuento||0,cantidad:i.cantidad,subtotal:i.precio*i.cantidad})),
            subtotalProductos:subtotal,
            envio:envio,
            envioGratis:tipoEntrega==='envio'&&envio===0,
            total:total,
            cupon:cuponParaRegistrar?{codigo:cuponParaRegistrar.codigo,monto:dcMonto}:null,
            origen:'web',
            creadoEn:firebase.firestore.FieldValue.serverTimestamp()
        };
        let _pedidoGuardado=true;
        try{
            await db.collection('pedidos').add(pedido);
        }catch(e){
            /* Si falla el guardado (billing, red, reglas), NO frenar: el pedido por WhatsApp
               es lo importante. Pero fallaba EN SILENCIO, y ese es el problema de verdad: el
               cliente veia "Pedido confirmado", el mensaje salia por WhatsApp igual, y en el
               panel no aparecia nada, con el numero de pedido ya consumido por la transaccion
               de arriba. El comercio se enteraba cuando el cliente venia a buscar algo que no
               existia. Y no pasaba solo con la red caida: pasaba con CUALQUIER rechazo de las
               reglas. El aviso viaja ahora en el propio mensaje, que es lo unico que el
               comercio mira seguro. */
            _pedidoGuardado=false;
            console.warn('No se pudo guardar el pedido en BDD, se continua con WhatsApp:',e);
        }
        /* Construir mensaje de WhatsApp con el numero de pedido */
        const numeroFmt=String(pedidoNum).padStart(3,'0');
        let msg='Hola! *Pedido confirmado N°'+numeroFmt+'*\n\n';
        msg+='*Cliente:* '+clienteNombreCompleto+'\n';
        msg+='*Tel:* '+telefonoLimpio+'\n';
        msg+='*Entrega:* '+(tipoEntrega==='retiro'?'Retiro en local':'Envío a domicilio')+'\n';
        if(tipoEntrega==='envio'&&direccion)msg+='*Dirección:* '+direccion+'\n';
        if(cuponParaRegistrar)msg+='*Cupón:* '+cuponParaRegistrar.codigo+' (-$'+dcMonto.toLocaleString('es-AR')+')\n';
        if(notas)msg+='*Notas:* '+notas+'\n';
        if(!_pedidoGuardado)msg+='\n*(Este pedido no se registro automaticamente en el sistema: hay que cargarlo a mano)*\n';
        msg+='\nGracias!';
        /* Limpiar carrito y resetear las cards de productos */
        const idsAResetear=carrito.map(i=>i.id);
        carrito=[];saveCart();updateCartUI();
        idsAResetear.forEach(id=>updateProductCard(id));
        closeCheckoutModal();closeCart();
        showToast('Pedido N°'+numeroFmt+' confirmado','success');
        /* Registrar uso del cupón ANTES de abrir WhatsApp (en móvil location.href corta la ejecución del código que sigue) */
        if (cuponParaRegistrar) {
            try {
                const cuponId = cuponParaRegistrar.id || (await db.collection('cupones').where('codigo','==',cuponParaRegistrar.codigo).get()).docs[0]?.id;
                if (cuponId) {
                    /* Verificaciones finales con datos frescos de la BDD */
                    let puedeUsar = true;
                    /* 1. Máximo de usos global (lee el cupón actualizado) */
                    try {
                        const cupFresh = await db.collection('cupones').doc(cuponId).get();
                        if (cupFresh.exists) {
                            const cd = cupFresh.data();
                            if (cd.activo === false) puedeUsar = false;
                            if (cd.maxUsos && (parseInt(cd.usos||0) >= parseInt(cd.maxUsos))) puedeUsar = false;
                        }
                    } catch(e) {}
                    /* 2. Que este cliente no lo haya usado ya (por cuponId, no por código) */
                    if (puedeUsar && clienteAuth) {
                        const chk = await db.collection('cuponesUsos').where('cuponId','==',cuponId).where('uid','==',clienteAuth.uid).get();
                        if (!chk.empty) puedeUsar = false;
                    }
                    if (puedeUsar) {
                        const usoData = {
                            cuponId: cuponId,
                            codigo: cuponParaRegistrar.codigo,
                            fecha: firebase.firestore.FieldValue.serverTimestamp(),
                            pedidoNum: pedidoNum
                        };
                        /* Siempre hay sesión: comprar la exige. La rama de invitado que
                           estaba acá escribía cuponesUsos sin uid, que la regla rechaza. */
                        usoData.uid = clienteAuth.uid; usoData.email = clienteAuth.email;
                        await db.collection('cuponesUsos').doc().set(usoData);
                    }
                }
            } catch(e) { console.warn('Error registrando uso de cupón:', e); }
        }
        /* Abrir WhatsApp - en móvil location.href, en desktop nueva pestaña */
        const waUrl='https://wa.me/'+WHATSAPP_NUMBER+'?text='+encodeURIComponent(msg);
        const esMovil=/iPad|iPhone|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if(esMovil){window.location.href=waUrl;}else{window.open(waUrl,'_blank');}
    }catch(e){
        console.error('Error en checkout:',e);
        showToast('Error: '+(e.message||'No se pudo confirmar'),'error');
        btn.disabled=false;btn.innerHTML='<i class="bi bi-whatsapp"></i> Confirmar pedido y enviar por WhatsApp';
    }
}

function showToast(message,type){type=type||'info';const c=document.getElementById('toastContainer');if(!c)return;const icons={success:'bi-check-circle-fill',error:'bi-exclamation-circle-fill',info:'bi-info-circle-fill'};const t=document.createElement('div');t.className='toast '+type;t.innerHTML='<i class="toast-icon bi '+(icons[type]||icons.info)+'"></i><span class="toast-message">'+message+'</span>';c.appendChild(t);setTimeout(()=>{t.classList.add('removing');setTimeout(()=>t.remove(),300);},3000);}

/* Observador unico y reutilizable, para poder enganchar tambien lo que se dibuja
   despues (las tarjetas de producto llegan recien cuando responde Firestore). */
let _scrollAnimObserver=null;
function scrollAnimObserve(nodos){
    if(!_scrollAnimObserver||!nodos||!nodos.length)return;
    nodos.forEach(el=>{
        if(el.dataset.animObs)return;
        el.dataset.animObs='1';
        el.style.opacity='0';el.style.transform='translateY(30px)';
        el.style.transition='opacity 0.6s ease, transform 0.6s ease';
        _scrollAnimObserver.observe(el);
    });
}
/* ------------------------------------------------- empujon hacia los productos
   Si pasan 10 segundos sin que el visitante toque NADA, la pagina baja sola hasta
   el catalogo. Mover la pagina sin que la pidan puede sentirse como que se escapa,
   asi que esta acotado a lo que de verdad parece "llegue y me quede mirando":
     - una sola vez por visita, y despues se desarma del todo;
     - solo si sigue arriba de todo (si ya scrolleo, se respeta donde esta);
     - nunca con el carrito, el checkout o la ficha de un producto abiertos;
     - nunca si la pestania esta en segundo plano, para que no se encuentre la
       pagina movida al volver;
     - nunca con "reducir movimiento" activado.

   Sobre el costo: no hay sondeo ni requestAnimationFrame. Los oyentes hacen UNA
   asignacion (guardar la hora) y son todos pasivos, asi que no tocan el hilo del
   scroll. El temporizador es uno solo: cuando salta mira cuanto falta y, si falta,
   se vuelve a agendar por ese resto. En una visita normal son dos o tres
   setTimeout en total, no uno por cada movimiento del mouse. */
const AUTOSCROLL_MS = 10000;
let _ultimaActividad = Date.now();
let _autoScrollVivo = false;
const _EVENTOS_ACTIVIDAD = ['pointerdown','pointermove','keydown','wheel','touchstart','scroll','click'];
function _marcarActividad(){ _ultimaActividad = Date.now(); }
function _hayAlgoAbierto(){
    return !!document.querySelector('.product-detail-modal.show, .checkout-modal.show, .cart-sidebar.show');
}
function initAutoScrollProductos(){
    if(window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;
    /* Si la URL ya apunta a una seccion, el visitante dijo a donde queria ir. */
    if(location.hash)return;
    const destino=document.getElementById('productos');
    if(!destino)return;
    _autoScrollVivo=true;
    _EVENTOS_ACTIVIDAD.forEach(ev=>window.addEventListener(ev,_marcarActividad,{passive:true}));
    /* Al volver de otra pestania se reinicia la cuenta: si no, el rato que estuvo
       afuera contaria como inactividad y se encontraria la pagina ya movida. */
    document.addEventListener('visibilitychange',_marcarActividad,{passive:true});
    const desarmar=()=>{
        _autoScrollVivo=false;
        _EVENTOS_ACTIVIDAD.forEach(ev=>window.removeEventListener(ev,_marcarActividad));
        document.removeEventListener('visibilitychange',_marcarActividad);
    };
    const revisar=()=>{
        if(!_autoScrollVivo)return;
        /* Si se fue de la pagina, si abrio algo, o si ya bajo por su cuenta, no se
           insiste ahora: se vuelve a mirar mas tarde. */
        if(document.hidden||_hayAlgoAbierto()||window.scrollY>10){
            setTimeout(revisar,AUTOSCROLL_MS);
            return;
        }
        const inactivo=Date.now()-_ultimaActividad;
        if(inactivo<AUTOSCROLL_MS){ setTimeout(revisar,AUTOSCROLL_MS-inactivo); return; }
        desarmar();
        destino.scrollIntoView({behavior:'smooth',block:'start'});
    };
    setTimeout(revisar,AUTOSCROLL_MS);
}
function initScrollAnimations(){
    /* Antes esto se apagaba entero debajo de 768px, asi que en el telefono no se
       animaba nada. Ahora si: las tarjetas de contenido son pocas y solo mueven
       opacity y transform. Las de producto siguen quedando afuera en pantallas
       chicas, que ahi pueden ser decenas y styles.css les saca las transiciones
       a proposito. */
    if(window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;
    _scrollAnimObserver=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('animate-in');_scrollAnimObserver.unobserve(e.target);}});},{threshold:0.1,rootMargin:'0px 0px -50px 0px'});
    const s=document.createElement('style');
    s.textContent='.animate-in{opacity:1!important;transform:translateY(0)!important;}';
    document.head.appendChild(s);
    scrollAnimObserve(document.querySelectorAll('.service-card,.feature-card'));
}
/* Las .product-card no existian todavia cuando corria initScrollAnimations (se crean
   al responder Firestore), asi que el selector no enganchaba ninguna y esa parte de
   la animacion nunca se ejecuto. Ahora se enganchan despues de cada dibujado. */
function scrollAnimProductos(){
    if(!_scrollAnimObserver||window.innerWidth<768)return;
    scrollAnimObserve(document.querySelectorAll('.product-card'));
}

function toggleCategoryFilters(){const f=document.getElementById('categoryFilters');const btn=document.getElementById('toggleCatsBtn');f.classList.toggle('cat-hidden');if(f.classList.contains('cat-hidden')){btn.innerHTML='<i class="bi bi-funnel"></i> Categorias';}else{btn.innerHTML='<i class="bi bi-funnel-fill"></i> Categorias';}}

window.filterByCategory=filterByCategory;window.filterBySubCategory=filterBySubCategory;window.updateProductQuantity=updateProductQuantity;window.addToCart=addToCart;window.updateCartItemQuantity=updateCartItemQuantity;window.removeFromCart=removeFromCart;window.onSearchInput=onSearchInput;window.toggleSortPrice=toggleSortPrice;window.toggleSortAlfa=toggleSortAlfa;window.goToPage=goToPage;window.toggleCategoryFilters=toggleCategoryFilters;window.openProductDetailModal=openProductDetailModal;window.closeProductDetailModal=closeProductDetailModal;window.pdmCarouselNav=pdmCarouselNav;window.pdmCarouselGoTo=pdmCarouselGoTo;window.refreshProductDetailModal=refreshProductDetailModal;window.clearCart=clearCart;window.openCheckoutModal=openCheckoutModal;window.closeCheckoutModal=closeCheckoutModal;window.setCheckoutEntrega=setCheckoutEntrega;window.confirmCheckout=confirmCheckout;window.onSelectDireccion=onSelectDireccion;window.aplicarCupon=aplicarCupon;window.quitarCupon=quitarCupon;window.authLogin=authLogin;window.onMobilePersonaClick=onMobilePersonaClick;window.authLogout=authLogout;window.toggleUserMenu=toggleUserMenu;window.closeUserMenu=closeUserMenu;window.guardarDatosCliente=guardarDatosCliente;window.openPerfilModal=openPerfilModal;window.closePerfilModal=closePerfilModal;window.switchPerfilTab=switchPerfilTab;window.guardarPerfil=guardarPerfil;window.mostrarFormDir=mostrarFormDir;window.cancelarFormDir=cancelarFormDir;window.guardarDireccion=guardarDireccion;window.eliminarDireccion=eliminarDireccion;window.openHistorialModal=openHistorialModal;window.closeHistorialModal=closeHistorialModal;window.filterHistPedidos=filterHistPedidos;window.repetirPedido=repetirPedido;

// Cargar contenido editable desde Firestore
/* Clave del cache local del contenido del sitio. Si alguna vez cambia la forma del
   documento, subir el numero y el cache viejo se ignora solo. */
const SC_CACHE_KEY='yerco_siteContent_v1';
function scCacheLeer(){try{const raw=localStorage.getItem(SC_CACHE_KEY);return raw?JSON.parse(raw):null;}catch(e){return null;}}
function scCacheGuardar(d){try{localStorage.setItem(SC_CACHE_KEY,JSON.stringify(d));}catch(e){/* modo privado o cuota llena: el sitio funciona igual, solo pierde el arranque rapido */}}
/* Reparte el documento config/siteContent sobre el DOM. Estaba adentro de
   loadSiteContent(); se separo para poder aplicarlo dos veces: primero con lo que
   quedo cacheado de la visita anterior, y despues con lo que responde Firestore. */
function applySiteContent(d){
    if(!d)return;
    const s=(id,val)=>{const el=document.querySelector(id);if(el&&val)el.textContent=val;};
    s('.hero-badge span',d.heroBadge);
    const tl=document.querySelectorAll('.title-line');if(tl[0]&&d.heroTitle1)tl[0].textContent=d.heroTitle1;
    const th=document.querySelectorAll('.title-highlight');if(th[0]&&d.heroTitle2)th[0].textContent=d.heroTitle2;
    s('.hero-subtitle',d.heroSubtitle);
    const stats=document.querySelectorAll('.stat-item');
    if(stats[0]&&d.stat1Num){stats[0].querySelector('.stat-number').textContent=d.stat1Num;stats[0].querySelector('.stat-label').textContent=d.stat1Label||'';}
    if(stats[1]&&d.stat2Num){stats[1].querySelector('.stat-number').textContent=d.stat2Num;stats[1].querySelector('.stat-label').textContent=d.stat2Label||'';}
    s('.why-us-section .section-tag',d.nosotrosTag);s('.why-us-section .section-title',d.nosotrosTitulo);s('.why-us-text',d.nosotrosTexto);
    const badges=document.querySelectorAll('.trust-badge span');if(badges[0]&&d.badge1)badges[0].textContent=d.badge1;if(badges[1]&&d.badge2)badges[1].textContent=d.badge2;
    const cards=document.querySelectorAll('.feature-card');
    if(cards[0]){if(d.card1t)cards[0].querySelector('h4').textContent=d.card1t;if(d.card1p)cards[0].querySelector('p').textContent=d.card1p;}
    if(cards[1]){if(d.card2t)cards[1].querySelector('h4').textContent=d.card2t;if(d.card2p)cards[1].querySelector('p').textContent=d.card2p;}
    if(cards[2]){if(d.card3t)cards[2].querySelector('h4').textContent=d.card3t;if(d.card3p)cards[2].querySelector('p').textContent=d.card3p;}
    if(cards[3]){if(d.card4t)cards[3].querySelector('h4').textContent=d.card4t;if(d.card4p)cards[3].querySelector('p').textContent=d.card4p;}
    s('.cta-title',d.ctaTitulo);s('.cta-text',d.ctaTexto);s('.footer-description',d.footerDesc);
    if(d.instagram){const ig=document.querySelector('.social-links a[aria-label="Instagram"]');if(ig)ig.href=d.instagram;}
    if(d.whatsapp){const wa=document.querySelectorAll('a[href*="wa.me"]:not(.wa-dev)');wa.forEach(a=>{a.href=a.href.replace(/wa\.me\/[0-9]+/,'wa.me/'+d.whatsapp);});}
    if(d.email){const em=document.querySelector('.social-links a[aria-label="Email"]');if(em)em.href='mailto:'+d.email;}
    /* Bloque de contacto del footer. Estaba escrito a mano en index.html y no habia
       forma de cambiarlo desde el panel: cambiar de local, de telefono o de horario
       obligaba a tocar el HTML. El caso mas raro era el telefono, que TENIA campo
       (telefonoDisplay, en SC_FIELDS y en SC_DEFAULTS) pero no tenia ni control en
       el Editor Web ni una sola linea que lo aplicara, asi que no hacia nada. */
    if(d.telefonoDisplay){const tel=document.getElementById('footerTelefono');if(tel){tel.textContent=d.telefonoDisplay;tel.href='tel:'+d.telefonoDisplay.replace(/[^0-9+]/g,'');}}
    if(d.direccion){const dir=document.getElementById('footerDireccion');if(dir){dir.textContent=d.direccion;dir.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(d.direccion);}}
    if(d.horario){const hor=document.getElementById('footerHorario');if(hor)hor.textContent=d.horario;}
    /* El mail salia en dos lugares y el campo solo actualizaba el icono de arriba. */
    if(d.email){const fe=document.getElementById('footerEmail');if(fe){fe.textContent=d.email;fe.href='mailto:'+d.email;}}
    /* Velo blanco del hero: 0 = la foto se ve limpia, 100 = velo al maximo.
       Ojo con el 0, que es un valor legitimo: no sirve `if(d.heroVelo)`. */
    if(d.heroVelo!==undefined&&d.heroVelo!==null&&d.heroVelo!==''){
        const velo=Math.min(100,Math.max(0,parseFloat(d.heroVelo)));
        const hs=document.querySelector('.hero-section');
        if(hs&&!isNaN(velo))hs.style.setProperty('--hero-velo',(velo/100).toFixed(3));
    }
    const ho=document.querySelector('.hero-overlay');
    if(ho){
        if(d.heroImg&&d.heroImg.startsWith('http')){
            const heroOptim=optImg(d.heroImg,1600);
            /* El arranque temprano de index.html ya pudo poner esta misma imagen con
               la URL cacheada. Volver a asignarla reiniciaria la transicion y haria
               parpadear el hero, asi que solo se toca si cambio. */
            if(ho.dataset.heroSrc!==heroOptim&&window.__heroPre!==heroOptim){
                const poner=(u)=>{ho.style.backgroundImage='url('+u+')';ho.style.backgroundSize='cover';ho.style.backgroundPosition='center';ho.style.opacity='0.35';ho.dataset.heroSrc=heroOptim;};
                const pre=new Image();pre.fetchPriority='high';
                pre.onload=()=>poner(heroOptim);
                pre.onerror=()=>poner(d.heroImg);
                pre.src=heroOptim;
            }
        }else{
            ho.style.opacity='0.35';
        }
    }
    /* Un solo <style> reutilizado: applySiteContent corre dos veces (cache y red) y
       antes cada pasada agregaba otra etiqueta al head. */
    if(d.ctaImg&&d.ctaImg.startsWith('http')&&document.querySelector('.cta-background')){
        let st=document.getElementById('ctaImgStyle');
        if(!st){st=document.createElement('style');st.id='ctaImgStyle';document.head.appendChild(st);}
        st.textContent='.cta-background::before{background-image:url('+d.ctaImg+')!important}';
    }
    if(d.logoIcon&&d.logoIcon.startsWith('http')){const li=document.querySelector('.logo-img');if(li)li.src=d.logoIcon;}
    if(d.logoText&&d.logoText.startsWith('http')){const lt=document.querySelector('.brand-text-img');if(lt)lt.src=d.logoText;}
    if(d.logoFooter&&d.logoFooter.startsWith('http')){const lf=document.querySelector('.footer-brand img');if(lf)lf.src=d.logoFooter;}
}
/* La imagen del hero no aparecia hasta que terminaban TRES esperas encadenadas:
   cargar el bundle de Firebase, la ida y vuelta a Firestore por config/siteContent,
   y recien ahi bajar la imagen. Medido en produccion: la peticion de la imagen no
   arrancaba hasta los 1225 ms y el hero se veia a los ~2070 ms.
   Ahora el contenido de la visita anterior queda en localStorage y se pinta al
   instante -index.html ademas precarga la imagen desde el <head> con esa misma URL-,
   mientras Firestore revalida por atras y corrige si algo cambio. */
async function loadSiteContent(){
    const cache=scCacheLeer();
    if(cache)applySiteContent(cache);
    try{
        const snap=await db.collection('config').doc('siteContent').get();
        if(!snap.exists)return;
        const d=snap.data();
        applySiteContent(d);
        scCacheGuardar(d);
    }catch(e){console.log('Site content not loaded:',e);}
}
loadSiteContent();

// === REVIEWS ===
let allReviewsIndex=[];let rvFilter='all';let rvPage=0;
async function loadReviews(){
    const grid=document.getElementById('reviewsGrid');if(!grid)return;
    try{
        const snap=await db.collection('resenas').orderBy('fecha','desc').limit(50).get();
        allReviewsIndex=snap.docs.filter(d=>{const r=d.data();return r.visible===true&&r.usado===true;}).map(d=>{const r=d.data();return{...r,fecha:r.fecha&&r.fecha.toDate?r.fecha.toDate():new Date()};});
        const filtersEl=document.getElementById('reviewsFilters');
        if(filtersEl)filtersEl.style.display=allReviewsIndex.length>0?'flex':'none';
        rvPage=0;renderReviewsIndex();
    }catch(e){console.error('Reviews error:',e);grid.innerHTML='';}
}
function filterReviews(f){
    rvFilter=f;rvPage=0;
    document.querySelectorAll('.rv-filter-btn').forEach(b=>b.classList.remove('active'));
    event.target.classList.add('active');
    renderReviewsIndex();
}
window.filterReviews=filterReviews;
function rvGoPage(p){rvPage=p;renderReviewsIndex();document.getElementById('resenas').scrollIntoView({behavior:'smooth'});}
window.rvGoPage=rvGoPage;
function renderReviewsIndex(){
    const grid=document.getElementById('reviewsGrid');if(!grid)return;
    let items=allReviewsIndex;
    if(rvFilter==='positive')items=items.filter(r=>(r.estrellas||0)>=3);
    else if(rvFilter==='negative')items=items.filter(r=>(r.estrellas||0)<=2);
    else if(typeof rvFilter==='number')items=items.filter(r=>(r.estrellas||0)===rvFilter);
    const isMobile=window.innerWidth<=768;
    const perPage=isMobile?4:10;
    const pages=Math.ceil(items.length/perPage)||1;
    if(rvPage>=pages)rvPage=pages-1;
    const shown=items.slice(rvPage*perPage,(rvPage+1)*perPage);
    if(!shown.length){grid.innerHTML='<div style="text-align:center;padding:2rem;color:#999;grid-column:1/-1"><p>'+(rvFilter==='all'?'Aun no hay opiniones.':'No hay opiniones con este filtro.')+'</p></div>';document.getElementById('reviewsPager').innerHTML='';return;}
    grid.innerHTML=shown.map(r=>{
        const stars='&#9733;'.repeat(r.estrellas||0)+'&#9734;'.repeat(5-(r.estrellas||0));
        const fecha=r.fecha.toLocaleDateString('es-AR');
        const hora=r.fecha.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
        return '<div class="review-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem"><div class="review-stars">'+stars+'</div><span class="review-date">'+fecha+' '+hora+'</span></div><div class="review-text">"'+esc(r.comentario||'')+'"</div><div class="review-author">'+esc(r.nombre||'')+'</div></div>';
    }).join('');
    const pg=document.getElementById('reviewsPager');
    if(pages>1){pg.innerHTML='<button onclick="rvGoPage('+(rvPage-1)+')" style="padding:0.4rem 1rem;border:1px solid #ccc;border-radius:8px;background:white;cursor:pointer"'+(rvPage===0?' disabled':'')+'>Ant</button><span style="padding:0.4rem 0.5rem;font-size:0.85rem;color:#666">'+(rvPage+1)+'/'+pages+'</span><button onclick="rvGoPage('+(rvPage+1)+')" style="padding:0.4rem 1rem;border:1px solid #ccc;border-radius:8px;background:white;cursor:pointer"'+(rvPage>=pages-1?' disabled':'')+'>Sig</button>';}else{pg.innerHTML='';}
}
loadReviews();


/* ===== AUTH CLIENTES ===== */
const authClient = firebase.auth();

/* La fuente de verdad del estado de login es onAuthStateChanged (más abajo).
   No llamamos _onUserLogin desde acá para evitar ejecuciones duplicadas. */
let clienteAuth = null; // datos del cliente en Firestore
let _pedidosListener = null;

/* Detectar mobile (iOS, Android, cualquier browser móvil) */
const _isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const _isMobileAuth = _isIOS || /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

/* Inicializar auth */
let _loginActivo = sessionStorage.getItem('_authLoginActivo') === '1';
let _authProcesando = false; /* evita ejecuciones concurrentes de _onUserLogin */
let _ultimoUidProcesado = null; /* evita reprocesar el mismo usuario */

/* 1) Persistencia LOCAL primero: la sesión sobrevive a recargas y cierres del navegador */
authClient.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch(e => console.error('setPersistence error:', e));

/* 2) onAuthStateChanged es la ÚNICA fuente de verdad del login.
   Se dispara al cargar (si hay sesión), tras popup, y tras volver de un redirect. */
authClient.onAuthStateChanged(async user => {
    if (user) {
        /* Evitar reprocesar el mismo usuario o ejecuciones concurrentes */
        if (_authProcesando) return;
        if (_ultimoUidProcesado === user.uid && clienteAuth) {
            _updateNavAuth(user);
            return;
        }
        _authProcesando = true;
        const wasActive = _loginActivo;
        _loginActivo = false;
        sessionStorage.removeItem('_authLoginActivo');
        try {
            await _onUserLogin(user, wasActive);
            _ultimoUidProcesado = user.uid;
        } catch (e) {
            console.error('_onUserLogin error:', e);
        } finally {
            _authProcesando = false;
        }
    } else {
        _ultimoUidProcesado = null;
        _onUserLogout();
    }
});

/* 3) getRedirectResult: solo para detectar el retorno de un login por redirect (fallback)
   y manejar acciones post-login (ej. abrir el carrito). El login en sí lo hace onAuthStateChanged. */
authClient.getRedirectResult().then(result => {
    if (result && result.user) {
        /* El usuario volvió de un redirect exitoso. onAuthStateChanged ya lo procesa.
           Acá solo manejamos la intención de compra previa. */
        if (sessionStorage.getItem('_intentoCompra') === '1') {
            sessionStorage.removeItem('_intentoCompra');
            setTimeout(() => { if (carrito.length > 0 && typeof openCart === 'function') openCart(); }, 1000);
        }
    }
}).catch(e => { console.error('getRedirectResult error:', e); });

async function _onUserLogin(user, showModal=false) {
    /* Mostrar avatar inmediatamente mientras carga Firestore */
    _updateNavAuth(user);
    /* checkout se refresca al final de _onUserLogin, después de cargar Firestore */
    /* Cargar o crear doc en clientesAuth */
    const ref = db.collection('clientesAuth').doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
        /* Asignar ID de cliente incremental */
        let clienteId = 1;
        try {
            const cntRef = db.collection('config').doc('clientesAuthCount');
            await db.runTransaction(async t => {
                const s = await t.get(cntRef);
                clienteId = (s.exists ? (parseInt(s.data().count) || 0) : 0) + 1;
                t.set(cntRef, { count: clienteId });
            });
        } catch(e) { console.warn('clienteId error:', e); }
        /* Nuevo cliente — crear doc básico */
        /* Google ya nos dice como se llama la persona: displayName viene en el mismo
           objeto `user` y de hecho se usa mas abajo para las iniciales del avatar. Pero
           el alta lo guardaba en blanco, asi que en el panel el cliente quedaba como
           "Sin nombre / datos incompletos" para siempre si nunca completaba el modal
           -que solo aparece en el login activo, no al restaurar la sesion-.
           Se parte por el primer espacio: lo que sigue es apellido. El telefono no lo
           da Google, asi que "datos incompletos" se mantiene hasta que lo carguen. */
        const _dn = (user.displayName || '').trim();
        const _corte = _dn.indexOf(' ');
        const _nombre = _corte > 0 ? _dn.slice(0, _corte) : _dn;
        const _apellido = _corte > 0 ? _dn.slice(_corte + 1).trim() : '';
        await ref.set({
            email: user.email,
            nombre: _nombre,
            apellido: _apellido,
            telefono: '',
            direcciones: [],
            clienteId: clienteId,
            creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
            ultimoAcceso: firebase.firestore.FieldValue.serverTimestamp(),
            visitas: 1
        });
        clienteAuth = { uid: user.uid, email: user.email, nombre: _nombre, apellido: _apellido, telefono: '', direcciones: [], clienteId };
    } else {
        clienteAuth = { uid: user.uid, ...snap.data(), clienteId: snap.data().clienteId || null };
        /* Registrar ultimo acceso para las metricas del admin.
           Throttle diario: si ya se registro una visita hoy, no se vuelve a escribir. Sin esto
           cada recarga de la pagina seria una escritura a Firestore. */
        try {
            const prev = snap.data().ultimoAcceso;
            const prevDate = prev && prev.toDate ? prev.toDate() : (prev ? new Date(prev) : null);
            const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
            if (!prevDate || prevDate < hoy) {
                ref.update({
                    ultimoAcceso: firebase.firestore.FieldValue.serverTimestamp(),
                    visitas: firebase.firestore.FieldValue.increment(1)
                }).catch(e => console.warn('ultimoAcceso:', e.message));
            }
        } catch (e) { console.warn('ultimoAcceso error:', e.message); }
        /* Los clientes dados de alta antes de 51e3f84 tienen el documento creado con el
           nombre en blanco, asi que arreglar el alta no los alcanza: en el panel siguen
           como "Sin nombre" para siempre. Google sigue diciendo como se llaman en cada
           login, no solo en el primero, asi que se completa lo que falta la proxima vez
           que entran. Solo si los DOS campos estan vacios, para no pisar lo que la
           persona haya editado despues a mano. */
        try {
            const _dn = (user.displayName || '').trim();
            if (_dn && !clienteAuth.nombre && !clienteAuth.apellido) {
                const _corte = _dn.indexOf(' ');
                const _nombre = _corte > 0 ? _dn.slice(0, _corte) : _dn;
                const _apellido = _corte > 0 ? _dn.slice(_corte + 1).trim() : '';
                await ref.update({ nombre: _nombre, apellido: _apellido });
                clienteAuth.nombre = _nombre;
                clienteAuth.apellido = _apellido;
            }
        } catch (e) { console.warn('No se pudo completar el nombre:', e.message); }
    }
    _updateNavAuth(user);
    /* Si faltan datos obligatorios Y fue un login activo, mostrar modal */
    if (showModal && (!clienteAuth.nombre || !clienteAuth.apellido || !clienteAuth.telefono)) {
        _showModalDatos();
    }
    /* Si el checkout estaba abierto, refrescar solo la parte de auth sin resetear el formulario */
    if (document.getElementById('checkoutModal')?.classList.contains('show')) {
        _refreshCheckoutAuth();
    }
}

function _refreshCheckoutAuth() {
    /* Se cerró la sesión con el checkout abierto: no queda un formulario que no
       se puede confirmar, se cierra y se avisa. */
    if (!clienteAuth) { closeCheckoutModal(); showToast('Cerraste la sesión: iniciá sesión para comprar','info'); return; }
    const datosSection = document.getElementById('chkDatosSection');
    const confirmBtn = document.getElementById('chkConfirmBtn');
    if (datosSection) datosSection.style.display = 'block';
    if (confirmBtn) confirmBtn.style.display = '';
    /* Pre-llenar solo si el campo está vacío (no pisar lo que el usuario escribió) */
    const n = document.getElementById('chkNombre');
    const a = document.getElementById('chkApellido');
    const t = document.getElementById('chkTelefono');
    if (n && !n.value) n.value = clienteAuth.nombre || '';
    if (a && !a.value) a.value = clienteAuth.apellido || '';
    if (t && !t.value) t.value = clienteAuth.telefono || '';
    /* Cargar direcciones guardadas */
    const dirs = clienteAuth.direcciones || [];
    const wrap = document.getElementById('chkDirGuardadasWrap');
    const sel = document.getElementById('chkDirSelect');
    const nuevaDirWrap = document.getElementById('chkNuevaDirWrap');
    const nomDirWrap = document.getElementById('chkNombreDirWrap');
    if (dirs.length) {
        sel.innerHTML = dirs.map((d,i) =>
            `<option value="${i}">${d.nombre} — ${d.texto}</option>`
        ).join('') + '<option value="nueva">+ Nueva dirección...</option>';
        if (wrap) wrap.style.display = 'block';
        if (nuevaDirWrap) nuevaDirWrap.style.display = 'none';
        /* Solo pre-seleccionar si no hay dirección ya elegida */
        if (!document.getElementById('chkDireccion').value) {
            document.getElementById('chkDireccion').value = dirs[0].texto;
            sel.value = '0';
        }
    } else {
        if (wrap) wrap.style.display = 'none';
        if (nuevaDirWrap) nuevaDirWrap.style.display = 'block';
        if (nomDirWrap) nomDirWrap.style.display = 'block';
    }
    updateCheckoutResumen();
}

function _onUserLogout() {
    clienteAuth = null;
    _ultimoUidProcesado = null;
    _authProcesando = false;
    _updateNavAuth(null);
    if (_pedidosListener) { _pedidosListener(); _pedidosListener = null; }
}

function _updateNavAuth(user) {
    const authBtn = document.getElementById('authNavBtn');
    const loginBtn = document.getElementById('loginNavBtn');
    const loginBtnMobile = document.getElementById('loginNavBtnMobile');
    const userBtn = document.getElementById('userNavBtn');
    const initials = document.getElementById('avatarInitials');
    const udNombre = document.getElementById('udNombre');
    const udEmail = document.getElementById('udEmail');
    if (!authBtn) return;
    authBtn.style.display = 'flex';
    if (user) {
        loginBtn.style.display = 'none';
        if (loginBtnMobile){loginBtnMobile.style.display='none';loginBtnMobile.style.visibility='hidden';}
        userBtn.style.display = 'flex';
        const nombre = (clienteAuth && clienteAuth.nombre) || user.displayName || '';
        const apellido = (clienteAuth && clienteAuth.apellido) || '';
        initials.textContent = ((nombre[0] || '') + (apellido[0] || '')).toUpperCase() || user.email[0].toUpperCase();
        udNombre.textContent = (nombre + (apellido ? ' ' + apellido : '')) || user.email;
        udEmail.textContent = user.email;
    } else {
        loginBtn.style.display = 'flex';
        if (loginBtnMobile){loginBtnMobile.style.display='flex';loginBtnMobile.style.visibility='visible';}
        userBtn.style.display = 'none';
    }
}

function onMobilePersonaClick() {
    if (clienteAuth) { toggleUserMenu(); } else { authLogin(); }
}
function authLogin() {
    try {
        _loginActivo = true;
        sessionStorage.setItem('_authLoginActivo', '1');
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');
        provider.setCustomParameters({ prompt: 'select_account' });
        /* POPUP-FIRST en TODOS los dispositivos (desktop y móvil).
           Es lo recomendado por Firebase desde 2024: no depende de cookies de terceros
           (que Safari/Firefox/Chrome bloquean) y es más confiable que redirect en móvil/iOS.
           El redirect queda solo como fallback automático cuando el popup falla. */
        firebase.auth().signInWithPopup(provider)
            .then(result => {
                /* No llamamos _onUserLogin acá: onAuthStateChanged ya lo procesa
                   automáticamente cuando el popup tiene éxito. Solo marcamos el flag
                   para que onAuthStateChanged sepa que fue un login activo (mostrar modal). */
                if (result && result.user) {
                    _loginActivo = true;
                }
                sessionStorage.removeItem('_authLoginActivo');
            })
            .catch(e => {
                console.error('popup error:', e.code, e.message);
                /* Errores donde el popup no es viable → caer a redirect */
                const necesitaRedirect = [
                    'auth/popup-blocked',
                    'auth/cancelled-popup-request',
                    'auth/popup-closed-by-user',
                    'auth/operation-not-supported-in-this-environment',
                    'auth/web-storage-unsupported',
                    'auth/network-request-failed'
                ].includes(e.code);
                /* popup-closed-by-user en móvil suele ser el navegador bloqueando el popup,
                   no el usuario cerrándolo: en móvil siempre intentamos redirect como fallback. */
                const esCierreEnMovil = e.code === 'auth/popup-closed-by-user' && _isMobileAuth;
                if (necesitaRedirect || esCierreEnMovil) {
                    firebase.auth().signInWithRedirect(provider).catch(er => {
                        console.error('redirect fallback error:', er.code, er.message);
                        showToast('No se pudo iniciar sesión. Probá de nuevo o usá otro navegador.', 'error');
                        _loginActivo = false;
                        sessionStorage.removeItem('_authLoginActivo');
                    });
                    return;
                }
                /* En desktop, si el usuario cerró el popup a propósito, no mostramos error */
                if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/user-cancelled') {
                    showToast('Error al iniciar sesión: ' + (e.message || e.code), 'error');
                }
                _loginActivo = false;
                sessionStorage.removeItem('_authLoginActivo');
            });
    } catch(e) {
        console.error('authLogin error:', e);
        showToast('Error al iniciar sesión: ' + e.message, 'error');
        _loginActivo = false;
        sessionStorage.removeItem('_authLoginActivo');
    }
}

function authLogout() {
    authClient.signOut();
    closeUserMenu();
}

function toggleUserMenu() {
    document.getElementById('userDropdown').classList.toggle('open');
}

function closeUserMenu() {
    document.getElementById('userDropdown')?.classList.remove('open');
}

/* Cerrar dropdown al clickear fuera */
document.addEventListener('click', function(e) {
    const btn = document.getElementById('avatarNavBtn');
    const dd = document.getElementById('userDropdown');
    if (dd && btn && !btn.contains(e.target) && !dd.contains(e.target)) {
        dd.classList.remove('open');
    }
});

/* === MODAL COMPLETAR DATOS === */
function _showModalDatos() {
    const m = document.getElementById('modalCompletarDatos');
    if (!m) return;
    m.style.display = 'flex';
    if (clienteAuth) {
        document.getElementById('cdNombre').value = clienteAuth.nombre || '';
        document.getElementById('cdApellido').value = clienteAuth.apellido || '';
        document.getElementById('cdTelefono').value = clienteAuth.telefono || '';
    }
}

async function guardarDatosCliente() {
    const nombre = document.getElementById('cdNombre').value.trim();
    const apellido = document.getElementById('cdApellido').value.trim();
    const telefono = document.getElementById('cdTelefono').value.trim();
    const err = document.getElementById('cdError');
    if (!nombre || !apellido || !telefono) {
        err.textContent = 'Completá todos los campos obligatorios.';
        err.style.display = 'block';
        return;
    }
    err.style.display = 'none';
    try {
        const user = authClient.currentUser;
        await db.collection('clientesAuth').doc(user.uid).update({ nombre, apellido, telefono });
        clienteAuth.nombre = nombre;
        clienteAuth.apellido = apellido;
        clienteAuth.telefono = telefono;
        document.getElementById('modalCompletarDatos').style.display = 'none';
        _updateNavAuth(user);
    } catch (e) {
        err.textContent = 'Error al guardar: ' + e.message;
        err.style.display = 'block';
    }
}

/* === MODAL PERFIL === */
function openPerfilModal() {
    if (!clienteAuth) return;
    const m = document.getElementById('modalPerfil');
    m.style.display = 'flex';
    document.getElementById('pfNombre').value = clienteAuth.nombre || '';
    document.getElementById('pfApellido').value = clienteAuth.apellido || '';
    document.getElementById('pfTelefono').value = clienteAuth.telefono || '';
    document.getElementById('pfEmail').value = clienteAuth.email || '';
    switchPerfilTab('datos');
    renderDirecciones();
}

function closePerfilModal() {
    document.getElementById('modalPerfil').style.display = 'none';
}

function switchPerfilTab(tab) {
    document.getElementById('perfilTabDatos').style.display = tab === 'datos' ? 'block' : 'none';
    document.getElementById('perfilTabDirecciones').style.display = tab === 'direcciones' ? 'block' : 'none';
    document.querySelectorAll('.perfil-tab').forEach((b, i) => b.classList.toggle('active', (i === 0 && tab === 'datos') || (i === 1 && tab === 'direcciones')));
}

async function guardarPerfil() {
    const nombre = document.getElementById('pfNombre').value.trim();
    const apellido = document.getElementById('pfApellido').value.trim();
    const telefono = document.getElementById('pfTelefono').value.trim();
    if (!nombre || !apellido || !telefono) { showToast('Completá todos los campos', 'error'); return; }
    try {
        await db.collection('clientesAuth').doc(clienteAuth.uid).update({ nombre, apellido, telefono });
        clienteAuth.nombre = nombre; clienteAuth.apellido = apellido; clienteAuth.telefono = telefono;
        _updateNavAuth(authClient.currentUser);
        showToast('Perfil actualizado', 'success');
        closePerfilModal();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

/* === DIRECCIONES === */
function renderDirecciones() {
    const dirs = clienteAuth?.direcciones || [];
    const c = document.getElementById('listaDirecciones');
    if (!c) return;
    if (!dirs.length) { c.innerHTML = '<p style="color:#999;font-size:0.88rem">No tenés direcciones guardadas.</p>'; return; }
    c.innerHTML = dirs.map((d, i) => `
        <div class="dir-card">
            <div><div class="dir-card-name">${esc(d.nombre)}</div><div class="dir-card-text">${esc(d.texto)}</div></div>
            <button class="dir-card-del" onclick="eliminarDireccion(${i})"><i class="bi bi-trash"></i></button>
        </div>`).join('');
    const addBtn = document.getElementById('btnAgregarDir');
    if (addBtn) addBtn.style.display = dirs.length >= 5 ? 'none' : 'block';
}

function mostrarFormDir() {
    document.getElementById('formDireccion').style.display = 'block';
    document.getElementById('dirNombre').value = '';
    document.getElementById('dirTexto').value = '';
}

function cancelarFormDir() {
    document.getElementById('formDireccion').style.display = 'none';
}

async function guardarDireccion() {
    /* sanitizeText ademas de escapar al mostrar: estos valores los lee tambien
       el panel /admin, asi que no queremos guardar HTML en la base. */
    const nombre = sanitizeText(document.getElementById('dirNombre').value, 60);
    const texto = sanitizeText(document.getElementById('dirTexto').value, 200);
    if (!nombre || !texto) { showToast('Completá los campos de la dirección', 'error'); return; }
    const dirs = clienteAuth.direcciones || [];
    if (dirs.length >= 5) { showToast('Máximo 5 direcciones', 'error'); return; }
    dirs.push({ nombre, texto });
    try {
        await db.collection('clientesAuth').doc(clienteAuth.uid).update({ direcciones: dirs });
        clienteAuth.direcciones = dirs;
        cancelarFormDir();
        renderDirecciones();
        showToast('Dirección guardada', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function eliminarDireccion(idx) {
    const dirs = clienteAuth.direcciones || [];
    dirs.splice(idx, 1);
    try {
        await db.collection('clientesAuth').doc(clienteAuth.uid).update({ direcciones: dirs });
        clienteAuth.direcciones = dirs;
        renderDirecciones();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

/* === HISTORIAL PEDIDOS === */
let _todosPedidosCliente = [];
let _filtroHistPedidos = 'todos';

function openHistorialModal() {
    if (!clienteAuth) return;
    document.getElementById('modalHistorial').style.display = 'flex';
    _cargarPedidosCliente();
}

function closeHistorialModal() {
    document.getElementById('modalHistorial').style.display = 'none';
    if (_pedidosListener) { _pedidosListener(); _pedidosListener = null; }
}

function _cargarPedidosCliente() {
    if (!clienteAuth) return;
    const c = document.getElementById('listaPedidosCliente');
    c.innerHTML = '<div style="text-align:center;padding:2rem;color:#999">Cargando...</div>';
    if (_pedidosListener) { _pedidosListener(); }
    _pedidosListener = db.collection('pedidos')
        .where('clienteAuthUid', '==', clienteAuth.uid)
        .orderBy('creadoEn', 'desc')
        .onSnapshot(snap => {
            _todosPedidosCliente = snap.docs.map(d => ({ id: d.id, ...d.data(), creadoEn: d.data().creadoEn?.toDate?.() || new Date() }));
            _renderPedidosCliente();
        }, err => {
            console.warn('pedidos listener error:', err);
            /* Fallback sin orderBy si falta el índice */
            db.collection('pedidos').where('clienteAuthUid', '==', clienteAuth.uid).get()
                .then(snap => {
                    _todosPedidosCliente = snap.docs.map(d => ({ id: d.id, ...d.data(), creadoEn: d.data().creadoEn?.toDate?.() || new Date() })).sort((a,b)=>b.creadoEn-a.creadoEn);
                    _renderPedidosCliente();
                })
                .catch(() => { c.innerHTML = '<div style="text-align:center;padding:2rem;color:#999">Sin pedidos aún.</div>'; });
        });
}

function filterHistPedidos(estado) {
    _filtroHistPedidos = estado;
    document.querySelectorAll('.hist-tab').forEach(b => b.classList.remove('active'));
    const tabs = { todos: 0, pendiente: 1, confirmado: 2, entregado: 3 };
    document.querySelectorAll('.hist-tab')[tabs[estado]]?.classList.add('active');
    _renderPedidosCliente();
}

function _renderPedidosCliente() {
    const c = document.getElementById('listaPedidosCliente');
    let pedidos = _todosPedidosCliente;
    if (_filtroHistPedidos !== 'todos') pedidos = pedidos.filter(p => p.estado === _filtroHistPedidos);
    if (!pedidos.length) {
        c.innerHTML = '<div style="text-align:center;padding:2rem;color:#999">Sin pedidos.</div>';
        return;
    }
    c.innerHTML = pedidos.map(p => {
        const num = '#' + String(p.numero || 0).padStart(6, '0');
        const fecha = p.creadoEn.toLocaleDateString('es-AR');
        const items = (p.items || []).map(i => '<div style="font-size:0.8rem;color:#555;padding:1px 0">• '+i.nombre+' <span style="color:#888">x'+i.cantidad+'</span></div>').join('');
        const estadoClass = 'estado-' + (p.estado || 'pendiente');
        const estadoLabel = { pendiente: 'Pendiente', confirmado: 'Confirmado', entregado: 'Entregado' }[p.estado] || p.estado;
        return `<div class="pedido-hist-card">
            <div class="pedido-hist-top">
                <span class="pedido-hist-num">${num}</span>
                <span class="pedido-hist-estado ${estadoClass}">${estadoLabel}</span>
                <span class="pedido-hist-total">$${(p.total||0).toLocaleString('es-AR')}</span>
            </div>
            <div style="font-size:0.78rem;color:#888;margin-bottom:0.5rem">${fecha} · ${p.tipoEntrega==='envio'?'Envío':'Retiro'}</div>
            <div class="pedido-hist-items">${items}</div>
            <button class="btn-repetir" onclick="repetirPedido('${p.id}')"><i class="bi bi-arrow-repeat"></i> Repetir pedido</button>
        </div>`;
    }).join('');
}

async function repetirPedido(pedidoId) {
    const pedido = _todosPedidosCliente.find(p => p.id === pedidoId);
    if (!pedido) return;
    let agregados = 0, omitidos = [];
    carrito = [];
    for (const item of (pedido.items || [])) {
        const prod = productos.find(p => p.id === item.id);
        if (!prod) { omitidos.push(item.nombre + ' (ya no existe)'); continue; }
        if ((prod.stock || 0) <= 0) { omitidos.push(item.nombre + ' (sin stock)'); continue; }
        carrito.push({ id: prod.id, nombre: prod.nombre, precio: prod.precio, imagen: prod.imagen, cantidad: item.cantidad });
        agregados++;
    }
    saveCart(); updateCartUI();
    closeHistorialModal();
    if (omitidos.length) showToast('Omitidos: ' + omitidos.join(', '), 'error');
    if (agregados) { showToast('Pedido cargado en tu carrito', 'success'); openCart(); }
}

/* ===== CUPONES ===== */
let _cuponAplicado = null;

async function aplicarCupon() {
    /* Si ya hay un cupón aplicado, no hacer nada */
    if (_cuponAplicado) return;
    const input = document.getElementById('chkCuponInput');
    const msg = document.getElementById('chkCuponMsg');
    const btn = input?.nextElementSibling;
    /* Sanitizar: solo letras mayúsculas, números y guiones */
    let codigo = (input?.value || '').trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '');
    if (input) input.value = codigo;
    if (!codigo) { if(msg) msg.innerHTML=''; return; }
    /* Limitar longitud para evitar abusos */
    if (codigo.length > 30) { if(msg) msg.innerHTML='<span style="color:#e53e3e">Código inválido.</span>'; return; }
    if (btn) { btn.disabled=true; btn.textContent='Verificando...'; }
    try {
        const snap = await db.collection('cupones').where('codigo', '==', codigo).where('activo', '==', true).get();
        if (snap.empty) {
            if(msg) msg.innerHTML='<span style="color:#e53e3e">Cupón no válido o inactivo.</span>';
            if(btn){btn.disabled=false;btn.textContent='Aplicar';}
            return;
        }
        const cupDoc = snap.docs[0];
        const cup = cupDoc.data();
        const monto = parseInt(cup.monto || 0);
        if (isNaN(monto) || monto < 1) {
            if(msg) msg.innerHTML='<span style="color:#e53e3e">Cupón inválido.</span>';
            if(btn){btn.disabled=false;btn.textContent='Aplicar';}
            return;
        }
        /* Verificar máximo de usos global */
        const usos = parseInt(cup.usos || 0);
        if (cup.maxUsos && usos >= parseInt(cup.maxUsos)) {
            if(msg) msg.innerHTML='<span style="color:#e53e3e">Este cupón ya alcanzó el máximo de usos.</span>';
            if(btn){btn.disabled=false;btn.textContent='Aplicar';}
            return;
        }
        /* Verificar uso por cliente (una vez por usuario) */
        if (clienteAuth) {
            const yaUsado = await db.collection('cuponesUsos')
                .where('cuponId', '==', cupDoc.id)
                .where('uid', '==', clienteAuth.uid)
                .get();
            if (!yaUsado.empty) {
                if(msg) msg.innerHTML='<span style="color:#e53e3e">Ya usaste este cupón anteriormente.</span>';
                if(btn){btn.disabled=false;btn.textContent='Aplicar';}
                return;
            }
        }
        /* Verificar límite de compra */
        const subtotal = carrito.reduce((s,i) => s + i.precio * i.cantidad, 0);
        if (cup.limiteCompra && subtotal < Number(cup.limiteCompra)) {
            if(msg) msg.innerHTML='<span style="color:#e53e3e">Este cupón requiere una compra mínima de $'+Number(cup.limiteCompra).toLocaleString('es-AR')+'.</span>';
            if(btn){btn.disabled=false;btn.textContent='Aplicar';}
            return;
        }
        /* Aplicar — deshabilitar input y botón para evitar doble aplicación */
        _cuponAplicado = { codigo, monto: monto, id: cupDoc.id };
        if(input){input.disabled=true;input.style.opacity='0.6';}
        if(btn){btn.disabled=true;btn.textContent='Aplicado ✓';btn.style.background='#2d6b4a';}
        if(msg) msg.innerHTML='<span style="color:#2d6b4a;font-weight:600">✓ $'+monto.toLocaleString('es-AR')+' de descuento aplicado.</span> <button onclick="quitarCupon()" style="background:none;border:none;color:#888;cursor:pointer;font-size:0.8rem;text-decoration:underline">Quitar</button>';
        updateCheckoutResumen();
    } catch(e) {
        if(msg) msg.innerHTML='<span style="color:#e53e3e">Error al verificar el cupón.</span>';
        if(btn){btn.disabled=false;btn.textContent='Aplicar';}
    }
}

function quitarCupon() {
    _cuponAplicado = null;
    const input = document.getElementById('chkCuponInput');
    const btn = input?.nextElementSibling;
    const msg = document.getElementById('chkCuponMsg');
    if(input){input.disabled=false;input.value='';input.style.opacity='1';}
    if(btn){btn.disabled=false;btn.textContent='Aplicar';btn.style.background='';}
    if(msg) msg.innerHTML='';
    updateCheckoutResumen();
}
