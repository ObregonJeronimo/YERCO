/**
 * ============================================
 * YERCO DIETÉTICA - SCRIPT PRINCIPAL
 * Firebase Firestore + Filtros + Búsqueda + Orden
 * ============================================
 */

const WHATSAPP_NUMBER = '5493512333009';
let productos = [];
let carrito = [];
let categoriaActual = 'Todos';
let subcategoriaActual = null;
let ordenAscendente = true; // default: menor a mayor
let busquedaTexto = '';

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    initParticles();
    initContactForm();
    initCart();
    loadProductsFromFirebase();
    initScrollAnimations();
});

// ============================================
// NAVBAR
// ============================================
function initNavbar() {
    const navbar = document.getElementById('mainNavbar');
    const navLinks = document.querySelectorAll('.nav-link');
    window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
        updateActiveNavLink();
    });
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            const navbarCollapse = document.querySelector('.navbar-collapse');
            if (navbarCollapse.classList.contains('show')) {
                bootstrap.Collapse.getInstance(navbarCollapse)?.hide();
            }
        });
    });
}

function updateActiveNavLink() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');
    let currentSection = '';
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 100;
        if (window.scrollY >= sectionTop && window.scrollY < sectionTop + section.offsetHeight) {
            currentSection = section.getAttribute('id');
        }
    });
    navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === '#' + currentSection);
    });
}

// ============================================
// HERO PARTICLES
// ============================================
function initParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (15 + Math.random() * 10) + 's';
        particle.style.width = (5 + Math.random() * 15) + 'px';
        particle.style.height = particle.style.width;
        container.appendChild(particle);
    }
}

// ============================================
// FORMULARIO DE CONTACTO
// ============================================
function initContactForm() {
    const form = document.getElementById('contactForm');
    const formSuccess = document.getElementById('formSuccess');
    if (!form) return;
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nombre = document.getElementById('nombre').value;
        const email = document.getElementById('email').value;
        const mensaje = document.getElementById('mensaje').value;
        const whatsappMessage = encodeURIComponent('¡Hola! Soy ' + nombre + '.\n\nEmail: ' + email + '\n\nMensaje: ' + mensaje);
        window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + whatsappMessage, '_blank');
        form.style.display = 'none';
        formSuccess.classList.add('show');
        setTimeout(() => { form.reset(); form.style.display = 'block'; formSuccess.classList.remove('show'); }, 5000);
    });
}

// ============================================
// FIREBASE: CARGAR PRODUCTOS
// ============================================
async function loadProductsFromFirebase() {
    const loading = document.getElementById('productsLoading');
    if (loading) loading.classList.add('show');

    try {
        const snapshot = await db.collection('productos').get();
        productos = snapshot.docs.map(doc => {
            const r = doc.data();
            return {
                id: doc.id,
                nombre: r.nombre || '',
                precio: r.precio || 0,
                stock: r.stock || 0,
                categoria: r.categoria || '',
                subcategoria: r.subcategoria || null,
                imagen: r.imagen || null,
                descripcion: r.descripcion || r.nombre || ''
            };
        });

        const categoriasMap = getCategoriasConSub(productos);
        renderCategoryFilters(categoriasMap);
        aplicarFiltros();
    } catch (error) {
        console.error("Error al cargar productos:", error);
        showToast('Error al cargar productos.', 'error');
    } finally {
        if (loading) loading.classList.remove('show');
    }
}

// ============================================
// CATEGORÍAS
// ============================================
function getCategoriasConSub(prods) {
    const mapa = {};
    prods.forEach(p => {
        if (!p.categoria) return;
        if (!mapa[p.categoria]) mapa[p.categoria] = new Set();
        if (p.subcategoria) mapa[p.categoria].add(p.subcategoria);
    });
    return mapa;
}

// ============================================
// FILTROS UNIFICADOS
// ============================================
function aplicarFiltros() {
    let resultado = [...productos];

    // Filtro por categoría
    if (categoriaActual !== 'Todos') {
        resultado = resultado.filter(p => p.categoria === categoriaActual);
    }

    // Filtro por subcategoría
    if (subcategoriaActual) {
        resultado = resultado.filter(p => p.subcategoria === subcategoriaActual);
    }

    // Filtro por búsqueda de texto
    if (busquedaTexto) {
        const q = busquedaTexto.toLowerCase();
        resultado = resultado.filter(p =>
            (p.nombre || '').toLowerCase().includes(q) ||
            (p.categoria || '').toLowerCase().includes(q) ||
            (p.subcategoria || '').toLowerCase().includes(q) ||
            (p.descripcion || '').toLowerCase().includes(q)
        );
    }

    // Ordenar por precio
    resultado.sort((a, b) => ordenAscendente ? a.precio - b.precio : b.precio - a.precio);

    renderProducts(resultado);
    updateSortButtonUI();
}

function filterByCategory(categoria) {
    categoriaActual = categoria;
    subcategoriaActual = null;
    aplicarFiltros();
}

function filterBySubCategory(categoria, subcategoria) {
    categoriaActual = categoria;
    subcategoriaActual = subcategoria;
    aplicarFiltros();
}

function onSearchInput(value) {
    busquedaTexto = value;
    aplicarFiltros();
}

function toggleSortOrder() {
    ordenAscendente = !ordenAscendente;
    aplicarFiltros();
}

function updateSortButtonUI() {
    const btn = document.getElementById('sortBtn');
    if (!btn) return;
    if (ordenAscendente) {
        btn.innerHTML = '<i class="bi bi-sort-numeric-up"></i> Menor precio';
        btn.title = 'Ordenar de mayor a menor';
    } else {
        btn.innerHTML = '<i class="bi bi-sort-numeric-down-alt"></i> Mayor precio';
        btn.title = 'Ordenar de menor a mayor';
    }
}

// ============================================
// FILTROS UI
// ============================================
function renderCategoryFilters(mapa) {
    const container = document.getElementById('categoryFilters');
    if (!container) return;
    container.innerHTML = "";

    // Botón "Todos"
    const todosBtn = document.createElement("button");
    todosBtn.className = "filter-btn active";
    todosBtn.textContent = "Todos";
    todosBtn.addEventListener("click", () => {
        setActiveFilter(todosBtn);
        document.querySelectorAll(".sub-filters").forEach(el => el.style.display = "none");
        filterByCategory("Todos");
    });
    container.appendChild(todosBtn);

    Object.keys(mapa).sort().forEach(cat => {
        const subs = [...mapa[cat]].sort();

        const catBtn = document.createElement("button");
        catBtn.className = "filter-btn";
        catBtn.textContent = cat;

        const subContainer = document.createElement("div");
        subContainer.className = "sub-filters";
        subContainer.style.display = "none";

        subs.forEach(sub => {
            const subBtn = document.createElement("button");
            subBtn.className = "filter-btn sub";
            subBtn.textContent = sub;
            subBtn.addEventListener("click", () => {
                filterBySubCategory(cat, sub);
            });
            subContainer.appendChild(subBtn);
        });

        catBtn.addEventListener("click", () => {
            setActiveFilter(catBtn);
            document.querySelectorAll(".sub-filters").forEach(el => el.style.display = "none");
            if (subs.length > 0) {
                subContainer.style.display = "flex";
                filterByCategory(cat); // show all of this cat while subs are visible
            } else {
                filterByCategory(cat);
            }
        });

        container.appendChild(catBtn);
        if (subs.length > 0) container.appendChild(subContainer);
    });
}

function setActiveFilter(activeBtn) {
    document.querySelectorAll("#categoryFilters > .filter-btn").forEach(b => b.classList.remove("active"));
    activeBtn.classList.add("active");
}

// ============================================
// FORMATO DE PRECIO
// ============================================
function formatPrice(value) {
    return value.toLocaleString("es-AR", { minimumFractionDigits: 0 });
}

// ============================================
// RENDERIZADO DE PRODUCTOS
// ============================================
function renderProducts(productosToRender) {
    const container = document.getElementById('productsGrid');
    if (!container) return;

    if (productosToRender.length === 0) {
        container.innerHTML = '<div class="empty-products"><i class="bi bi-search" style="font-size:2rem;color:var(--color-text-light)"></i><p style="color:var(--color-text-light);margin-top:1rem">No se encontraron productos</p></div>';
        return;
    }

    container.innerHTML = productosToRender.map(producto => {
        let stockClass = '';
        let stockText = 'Stock: ' + producto.stock;
        if (producto.stock === 0) { stockClass = 'out'; stockText = 'Sin stock'; }
        else if (producto.stock < 10) { stockClass = 'low'; stockText = 'Últimas ' + producto.stock; }

        const itemEnCarrito = carrito.find(item => item.id === producto.id);
        const cantidadEnCarrito = itemEnCarrito ? itemEnCarrito.cantidad : 0;
        const imgSrc = producto.imagen || 'https://via.placeholder.com/400x300?text=Sin+imagen';

        return '<article class="product-card" data-id="' + producto.id + '">' +
            '<div class="product-image">' +
                '<img src="' + imgSrc + '" alt="' + producto.nombre + '" loading="lazy" onerror="this.src=\'https://via.placeholder.com/400x300?text=Sin+imagen\'">' +
                '<span class="product-category">' + producto.categoria + (producto.subcategoria ? ' - ' + producto.subcategoria : '') + '</span>' +
                '<span class="product-stock ' + stockClass + '">' + stockText + '</span>' +
            '</div>' +
            '<div class="product-info">' +
                '<h3 class="product-name">' + producto.nombre + '</h3>' +
                '<div class="product-footer">' +
                    '<span class="product-price">$' + formatPrice(producto.precio) + '</span>' +
                    '<div class="quantity-controls">' +
                        '<button class="qty-btn" onclick="updateProductQuantity(\'' + producto.id + '\', -1)"' + (cantidadEnCarrito === 0 ? ' disabled' : '') + '><i class="bi bi-dash"></i></button>' +
                        '<span class="qty-value" id="qty-' + producto.id + '">' + cantidadEnCarrito + '</span>' +
                        '<button class="qty-btn" onclick="updateProductQuantity(\'' + producto.id + '\', 1)"' + (producto.stock === 0 || cantidadEnCarrito >= producto.stock ? ' disabled' : '') + '><i class="bi bi-plus"></i></button>' +
                    '</div>' +
                '</div>' +
                '<button class="add-to-cart-btn' + (cantidadEnCarrito > 0 ? ' added' : '') + '" onclick="addToCart(\'' + producto.id + '\')"' + (producto.stock === 0 ? ' disabled' : '') + '>' +
                    '<i class="bi ' + (cantidadEnCarrito > 0 ? 'bi-check-lg' : 'bi-cart-plus') + '"></i> ' +
                    (producto.stock === 0 ? 'Sin stock' : (cantidadEnCarrito > 0 ? 'En el carrito' : 'Agregar al carrito')) +
                '</button>' +
            '</div>' +
        '</article>';
    }).join('');
}

// ============================================
// CARRITO
// ============================================
function initCart() {
    const cartToggle = document.getElementById('cartToggle');
    const cartClose = document.getElementById('cartClose');
    const cartOverlay = document.getElementById('cartOverlay');
    const browseProductsBtn = document.getElementById('browseProductsBtn');
    const goToCartBtn = document.getElementById('goToCartBtn');
    const checkoutBtn = document.getElementById('checkoutBtn');

    const savedCart = localStorage.getItem('yercoCart');
    if (savedCart) { carrito = JSON.parse(savedCart); updateCartUI(); }

    cartToggle?.addEventListener('click', openCart);
    cartClose?.addEventListener('click', closeCart);
    cartOverlay?.addEventListener('click', closeCart);
    browseProductsBtn?.addEventListener('click', () => closeCart());
    goToCartBtn?.addEventListener('click', () => openCart());
    checkoutBtn?.addEventListener('click', checkout);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });
}

function openCart() {
    document.getElementById('cartSidebar')?.classList.add('show');
    document.getElementById('cartOverlay')?.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeCart() {
    document.getElementById('cartSidebar')?.classList.remove('show');
    document.getElementById('cartOverlay')?.classList.remove('show');
    document.body.style.overflow = '';
}

function updateProductQuantity(productId, change) {
    const producto = productos.find(p => p.id === productId);
    if (!producto) return;
    let itemIndex = carrito.findIndex(item => item.id === productId);
    if (itemIndex === -1 && change > 0) {
        carrito.push({ id: producto.id, nombre: producto.nombre, precio: producto.precio, imagen: producto.imagen, cantidad: 1 });
        showToast(producto.nombre + ' agregado al carrito', 'success');
    } else if (itemIndex !== -1) {
        const newQty = carrito[itemIndex].cantidad + change;
        if (newQty <= 0) { carrito.splice(itemIndex, 1); showToast(producto.nombre + ' eliminado del carrito', 'info'); }
        else if (newQty <= producto.stock) { carrito[itemIndex].cantidad = newQty; }
        else { showToast('Stock máximo alcanzado', 'error'); return; }
    }
    saveCart(); updateCartUI(); updateProductCard(productId);
}

function addToCart(productId) {
    const producto = productos.find(p => p.id === productId);
    if (!producto || producto.stock === 0) return;
    const existe = carrito.find(item => item.id === productId);
    if (existe) { openCart(); }
    else {
        carrito.push({ id: producto.id, nombre: producto.nombre, precio: producto.precio, imagen: producto.imagen, cantidad: 1 });
        showToast(producto.nombre + ' agregado al carrito', 'success');
        saveCart(); updateCartUI(); updateProductCard(productId);
    }
}

function updateProductCard(productId) {
    const producto = productos.find(p => p.id === productId);
    const itemEnCarrito = carrito.find(item => item.id === productId);
    const cantidad = itemEnCarrito ? itemEnCarrito.cantidad : 0;
    const qtyEl = document.getElementById('qty-' + productId);
    if (qtyEl) qtyEl.textContent = cantidad;
    const card = document.querySelector('.product-card[data-id="' + productId + '"]');
    if (card) {
        const minusBtn = card.querySelector('.qty-btn:first-child');
        const plusBtn = card.querySelector('.qty-btn:last-child');
        const addBtn = card.querySelector('.add-to-cart-btn');
        if (minusBtn) minusBtn.disabled = cantidad === 0;
        if (plusBtn) plusBtn.disabled = producto.stock === 0 || cantidad >= producto.stock;
        if (addBtn) {
            addBtn.classList.toggle('added', cantidad > 0);
            addBtn.innerHTML = cantidad > 0 ? '<i class="bi bi-check-lg"></i> En el carrito' : '<i class="bi bi-cart-plus"></i> Agregar al carrito';
        }
    }
}

function updateCartItemQuantity(productId, change) {
    const producto = productos.find(p => p.id === productId);
    const idx = carrito.findIndex(item => item.id === productId);
    if (idx === -1) return;
    const newQty = carrito[idx].cantidad + change;
    if (newQty <= 0) removeFromCart(productId);
    else if (newQty <= producto.stock) { carrito[idx].cantidad = newQty; saveCart(); updateCartUI(); updateProductCard(productId); }
    else showToast('Stock máximo: ' + producto.stock, 'error');
}

function removeFromCart(productId) {
    const idx = carrito.findIndex(item => item.id === productId);
    if (idx !== -1) {
        const name = carrito[idx].nombre;
        carrito.splice(idx, 1);
        showToast(name + ' eliminado', 'info');
        saveCart(); updateCartUI(); updateProductCard(productId);
    }
}

function saveCart() { localStorage.setItem('yercoCart', JSON.stringify(carrito)); }

function updateCartUI() {
    const cartBody = document.getElementById('cartBody');
    const cartEmpty = document.getElementById('cartEmpty');
    const cartFooter = document.getElementById('cartFooter');
    const cartCount = document.getElementById('cartCount');
    const cartTotal = document.getElementById('cartTotal');
    const ctaCartCount = document.getElementById('ctaCartCount');
    const checkoutBtn = document.getElementById('checkoutBtn');
    const totalItems = carrito.reduce((s, i) => s + i.cantidad, 0);
    const totalPrice = carrito.reduce((s, i) => s + (i.precio * i.cantidad), 0);
    if (cartCount) cartCount.textContent = totalItems;
    if (ctaCartCount) ctaCartCount.textContent = totalItems;
    if (cartTotal) cartTotal.textContent = '$' + formatPrice(totalPrice);
    if (carrito.length === 0) {
        if (cartEmpty) cartEmpty.style.display = 'block';
        if (cartFooter) cartFooter.style.display = 'none';
        cartBody?.querySelectorAll('.cart-item').forEach(item => item.remove());
    } else {
        if (cartEmpty) cartEmpty.style.display = 'none';
        if (cartFooter) cartFooter.style.display = 'block';
        renderCartItems();
    }
    if (checkoutBtn) checkoutBtn.disabled = carrito.length === 0;
}

function renderCartItems() {
    const cartBody = document.getElementById('cartBody');
    const cartEmpty = document.getElementById('cartEmpty');
    if (!cartBody) return;
    cartBody.querySelectorAll('.cart-item').forEach(item => item.remove());
    carrito.forEach(item => {
        const producto = productos.find(p => p.id === item.id);
        const maxStock = producto ? producto.stock : item.cantidad;
        const el = document.createElement('div');
        el.className = 'cart-item';
        el.innerHTML = '<img src="' + (item.imagen || 'https://via.placeholder.com/70x70?text=?') + '" alt="' + item.nombre + '" class="cart-item-image">' +
            '<div class="cart-item-info"><h4 class="cart-item-name">' + item.nombre + '</h4>' +
            '<span class="cart-item-price">$' + formatPrice(item.precio) + '</span>' +
            '<div class="cart-item-controls">' +
            '<button class="qty-btn" onclick="updateCartItemQuantity(\'' + item.id + '\', -1)"><i class="bi bi-dash"></i></button>' +
            '<span class="qty-value">' + item.cantidad + '</span>' +
            '<button class="qty-btn" onclick="updateCartItemQuantity(\'' + item.id + '\', 1)"' + (item.cantidad >= maxStock ? ' disabled' : '') + '><i class="bi bi-plus"></i></button>' +
            '<button class="cart-item-remove" onclick="removeFromCart(\'' + item.id + '\')"><i class="bi bi-trash"></i></button>' +
            '</div></div>';
        cartBody.insertBefore(el, cartEmpty);
    });
}

// ============================================
// CHECKOUT
// ============================================
function checkout() {
    if (carrito.length === 0) { showToast('Carrito vacío', 'error'); return; }
    let msg = '¡Hola! \uD83C\uDF3F Quiero realizar el siguiente pedido:\n\n\uD83D\uDCE6 *DETALLE DEL PEDIDO*\n--------------------\n';
    let total = 0;
    carrito.forEach((item, i) => {
        const sub = item.precio * item.cantidad;
        total += sub;
        msg += '\uD83D\uDED2 ' + (i+1) + '. ' + item.nombre + '\n   Cantidad: ' + item.cantidad + ' x $' + formatPrice(item.precio) + ' = $' + formatPrice(sub) + '\n\n';
    });
    msg += '--------------------\n\uD83D\uDCB0 *TOTAL: $' + formatPrice(total) + '*\n\n\uD83D\uDCCD Por favor, indíquenme opciones de envío o retiro.\n\uD83D\uDE4F ¡Gracias!';
    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(msg), '_blank');
    showToast('Redirigiendo a WhatsApp...', 'success');
    closeCart();
}

// ============================================
// TOAST
// ============================================
function showToast(message, type) {
    type = type || 'info';
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const icons = { success: 'bi-check-circle-fill', error: 'bi-exclamation-circle-fill', info: 'bi-info-circle-fill' };
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = '<i class="toast-icon bi ' + (icons[type] || icons.info) + '"></i><span class="toast-message">' + message + '</span>';
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 3000);
}

// ============================================
// ANIMACIONES
// ============================================
function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('animate-in'); observer.unobserve(entry.target); } });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    document.querySelectorAll('.service-card, .feature-card, .product-card').forEach(el => {
        el.style.opacity = '0'; el.style.transform = 'translateY(30px)'; el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
    const style = document.createElement('style');
    style.textContent = '.animate-in { opacity: 1 !important; transform: translateY(0) !important; }';
    document.head.appendChild(style);
}

// ============================================
// GLOBALES
// ============================================
window.filterByCategory = filterByCategory;
window.filterBySubCategory = filterBySubCategory;
window.updateProductQuantity = updateProductQuantity;
window.addToCart = addToCart;
window.updateCartItemQuantity = updateCartItemQuantity;
window.removeFromCart = removeFromCart;
window.onSearchInput = onSearchInput;
window.toggleSortOrder = toggleSortOrder;
