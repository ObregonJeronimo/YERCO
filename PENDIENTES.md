# YERCO — Pendientes

Estado del repo al escribir esto: `main`, todo commiteado y pusheado, árbol limpio.
Último commit: `57b19c4` (copiar productos: la cantidad va siempre, entre paréntesis).

Las tareas están ordenadas por riesgo: las dos primeras son bugs que se ven hoy en
producción, la tercera es rediseño, la cuarta es auditoría.

---

## Contexto del proyecto que hay que saber SÍ O SÍ

Esto no es opcional. Saltearlo rompe cosas.

**`index.html` carga `app.min.js`, NO `app.js`.** Todo cambio en la tienda necesita:

```bash
npm run build
```

Ese build corre `check-admin.js` primero, que detecta errores que `node --check` no ve
(una palabra clave colgada rompe el bloque entero de `admin.html` al ejecutar aunque la
sintaxis sea válida). Si falla, el deploy se cae y producción se queda con la versión
anterior, que funciona. Vercel corre el build en cada push.

**`admin.html` tiene DOS `</body>`**: uno real y otro dentro de una plantilla de
impresión de tickets. Cualquier reemplazo con `str.replace` sin contador rompe el bloque
JS entero. Usar siempre la última ocurrencia.

**Finales de línea:** `admin.html` e `index.html` en CRLF, `app.js` en LF. Preservarlos
al escribir con scripts, o el diff queda inservible.

**Firebase CLI está autenticado** (`jeroobregon03@gmail.com`, proyecto `yerco-bb620`
fijado en `.firebaserc`). Reglas, índices, Storage y las 10 Cloud Functions ya están
desplegadas al día. Si se tocan reglas: desplegar ANTES de pushear el código, si no el
panel falla con `permission-denied` y el error se lo come un `try/catch`.

**Para ver el panel sin loguearse**, generar un banco de pruebas: copia de `admin.html`
con Firebase stubbeado (auth que devuelve un admin, Firestore falso con datos de
ejemplo), guardada como `_test-admin.html`. El repo ignora `_test-*.html` en `.gitignore`
y `.vercelignore` a propósito. Servirlo con `npm run dev` (puerto 5173). Es la única
forma de medir la geometría real de las vistas y los modales.

**Los chequeos de sintaxis no alcanzan.** Los bugs de layout no dan error de consola ni
los agarra `check-admin.js`. Hay que medir el DOM: comparar la profundidad de anidado de
cada sección contra un commit anterior, cruzar cada `getElementById` contra los `id` que
existen, y medir anchos/altos reales de labels, inputs y botones.

---

## 1. ~~Presentaciones duplicadas en las tarjetas de la tienda~~ HECHO

**Síntoma:** algunos productos muestran su cantidad/presentación dos veces — una arriba
en el selector segmentado (bien) y otra abajo del botón "Agregar", escrita mucho más
larga. Pasa poco.

**Diagnóstico (confirmado, no hace falta re-investigar):** conviven dos sistemas de
presentaciones y la tarjeta renderiza los dos concatenados, sin `else`.

| Sistema | Dónde | Campo | Etiqueta |
|---|---|---|---|
| Nuevo (grupos) | `app.js:286-296`, var `grupoHTML` | `p.grupoId` | `grupoMascara \|\| gramaje \|\| nombre` |
| Viejo (gramajes) | `app.js:280-284`, var `gramajeHTML` | `h.gramajePadreId === p.id` | `h.gramaje \|\| h.nombre` |

En la plantilla de la tarjeta, `grupoHTML` va antes del botón Agregar y `gramajeHTML`
justo después. Si el producto tiene las dos cosas, salen los dos.

El texto largo sale del fallback `|| h.nombre` en `app.js:283`: cuando el hijo no tiene
`gramaje` cargado, el botón imprime el **nombre interno completo**.

Lo mismo en el modal de detalle: `app.js:645` (`pdmGramajeHtml`) y `app.js:651`
(`pdmGrupoHtml`) se concatenan y salen **dos secciones "Presentaciones"** seguidas.

Solo afecta a productos con `grupoId` **y además** hijos con `gramajePadreId`: migrados a
medias. Por eso pasa poco.

**Decisión tomada — hacer esto:**

1. **El sistema de grupos gana.** Si el producto tiene `grupoId` y el grupo tiene más de
   un miembro, NO renderizar `gramajeHTML`. Aplicar igual en la tarjeta y en el modal.
   Motivo: el sistema nuevo tiene `grupoMascara`, un campo hecho justamente para mostrar
   una etiqueta corta y limpia; el viejo no tiene con qué, y por eso cae al nombre
   interno. Mostrar los dos es siempre redundante, nunca aporta.
2. **Sacar el fallback `|| h.nombre`.** Si un hijo del sistema viejo no tiene `gramaje`,
   que muestre algo corto y previsible en vez del nombre interno entero. Elegir el
   reemplazo mirando qué datos hay realmente cargados.
3. **Revisar el lado del admin**: si los modales "Agrupar" y "Gramajes" permiten seguir
   creando esa combinación, evaluar avisar en pantalla o migrar los que ya están así.
4. Verificar renderizando con datos que tengan las dos cosas a la vez, no leyendo código.

---

## 2. ~~En móvil, el botón "Agregar al carrito" del modal de producto queda cortado~~ HECHO

**Síntoma:** en Android (verificar también en iPhone), al abrir el modal de detalle de un
producto, el botón de agregar al carrito se ve apenas un 10%. Se lo come la pantalla.

**Lo que ya se sabe:**

- La estructura es correcta: `.pdm-header` + `.pdm-body` (`flex:1; overflow-y:auto;
  min-height:0`) + `.pdm-footer` (`flex-shrink:0`, con `env(safe-area-inset-bottom)`).
  El markup está en `index.html:171-177`.
- **Sospecha principal:** `.product-detail-modal` usa `max-height: 92vh` con
  `top:50%; transform: translate(-50%,-50%)`. En los navegadores móviles `vh` NO
  descuenta la barra de URL, así que el alto real visible es menor que `100vh` y el
  modal centrado se sale por abajo. Es exactamente el patrón de "se lo come la pantalla".
  `styles.css` ya usa `dvh` en 3 lugares, pero no acá: hay 2 reglas con `max-height:92vh`
  sin fallback a `dvh`.
- El carrusel ocupa `380px` en escritorio y `300px` en móvil (media query a 600px), que
  es mucho del alto disponible y agrava el recorte.
- **Falta investigar:** hay una media query para `.product-detail-modal` que todavía no
  revisé (mi búsqueda anterior filtraba por `productDetail` y la clase es
  `product-detail-modal`, con guiones). Puede que en móvil el modal cambie a otra
  disposición y ahí esté la causa real. **Revisar eso primero.**

**Qué hacer:** reproducir en el navegador con viewport móvil, encontrar la causa real,
arreglarla, y verificar midiendo qué porcentaje del botón queda visible — que sea 100%.
Probar en Android y en iPhone (Safari tiene su propio comportamiento con la barra y con
`env(safe-area-inset-*)`).

---

## 3. ~~Hero: carga lentísima, rediseño y animaciones~~ HECHO

### 3a. La lentitud (diagnóstico confirmado)

La imagen de fondo del hero no aparece hasta que terminan **tres esperas encadenadas**:

1. Cargar e inicializar el bundle de Firebase (+ App Check).
2. `await db.collection('config').doc('siteContent').get()` — ida y vuelta a Firestore.
3. Recién ahí lee `d.heroImg`, crea un `new Image()` y espera a que baje **la imagen a
   tamaño completo**.

El código está en `loadSiteContent()`, `app.js:1098`.

**El agravante:** `optImg(url, w)` es un **stub que ignora el ancho y devuelve la URL
original** (`app.js:7`). O sea que `optImg(d.heroImg, 1600)` no reduce nada: se sirve la
imagen original de Firebase Storage, al tamaño que se subió. Lo mismo vale para TODAS las
imágenes de productos del sitio.

Además no hay `<link rel="preload">` del hero, ni placeholder, ni imagen de baja calidad
mientras carga: el hero queda vacío todo ese tiempo.

**Direcciones a evaluar** (elegir según lo que convenga, no hace falta todo):
- Que `optImg` haga algo de verdad: extensión Resize Images de Firebase Storage, o
  guardar variantes ya redimensionadas al subir desde el admin.
- Sacar el hero del camino crítico de Firestore: precargarlo, cachear la URL de la visita
  anterior, o dejar un fondo/gradiente de arranque para que nunca se vea vacío.
- `<link rel="preload" as="image">` con la URL del hero.
- Formatos modernos (WebP/AVIF) y `fetchpriority="high"` (ya está, pero llega tarde).
- Medir antes y después: LCP y tiempo hasta que el hero es visible, en escritorio y móvil.

### 3b. Rediseño y animaciones

Mejorar el diseño del hero y sumar **varias animaciones distintas**, optimizadas pero que
se noten al entrar a la página.

Criterios:
- Que no compitan con el LCP ni bloqueen el render.
- Animar solo `transform` y `opacity` (no `top`, `left`, `width`, ni cosas que disparen
  layout).
- Respetar `prefers-reduced-motion`.
- Que funcionen bien en móvil, que es donde más se nota el costo.
- Varias animaciones distintas, no la misma repetida.

Ojo: `app.js` ya tiene `initScrollAnimations()`, que hoy se apaga entero si el ancho es
menor a 768px. Revisar si conviene mantener esa exclusión.

---

## 4. ~~Datos hardcodeados en `index.html` vs el Editor Web~~ HECHO

**Sospecha del usuario:** hay datos en `index.html` que están escritos a mano y deberían
salir del Editor Web del admin.

**Qué hay que auditar:**

`loadSiteContent()` (`app.js:1098`) hidrata el DOM desde `config/siteContent` de
Firestore. Hidrata estos campos: `heroBadge`, `heroTitle1`, `heroTitle2`, `heroSubtitle`,
`stat1Num`, `stat1Label`, `stat2Num`, `stat2Label`, `nosotrosTag`, `nosotrosTitulo`,
`nosotrosTexto`, `badge1`, `badge2`, `card1t`…`card4p`, `ctaTitulo`, `ctaTexto`,
`footerDesc`, `instagram`, `whatsapp`, `email`, `heroImg`, `ctaImg`, `logoIcon`,
`logoText`, `logoFooter`.

Hay que cruzar tres cosas y ver dónde no coinciden:

1. Lo que está escrito a mano en `index.html`.
2. Lo que `loadSiteContent()` sabe hidratar.
3. Los campos que el Editor Web del admin ofrece editar (sección `sec-editor` en
   `admin.html`, y el objeto `SC_DEFAULTS`).

Buscar los tres casos:
- Texto en `index.html` que **no** se puede editar desde el panel.
- Campos que el panel ofrece pero que `loadSiteContent()` **no** aplica (se guardan y no
  hacen nada).
- Selectores de `loadSiteContent()` que ya no existen en `index.html` (hidratan la nada).

Ojo con `config-negocio.js`: **no** hidrata la tienda a propósito. Los datos del negocio
que ve el cliente salen de `config/siteContent`; `config-negocio.js` es solo para el
panel. No mezclar los dos, se pisan.

Revisar también `politicas.html` y `mayoristas.html`, que pueden tener los mismos datos
escritos a mano.

---

## Al terminar

- `npm run build` y verificar que `check-admin.js` pase.
- Verificar midiendo/ejecutando, no leyendo código.
- Commitear con mensajes que expliquen la causa, no solo el síntoma.
- Pushear y confirmar en `https://www.yerco.ar` que lo desplegado es lo nuevo.
- Ir tachando de este archivo lo que quede hecho.

---

# Estado al 27/08/2026

Las 4 tareas de arriba estan HECHAS, verificadas midiendo y confirmadas en
produccion. Despues salieron estos pedidos, todos hechos y desplegados:

| Commit | Que |
|---|---|
| `a238145` | una sola lista de presentaciones por producto |
| `0d15c9a` | modal de producto al viewport visible (dvh) en movil |
| `000b3af` | hero fuera del camino critico de Firestore + rediseno y animaciones |
| `a546acf` | datos de contacto del footer desde el panel |
| `b440ecd` | la X de los modales largos quedaba fuera de pantalla + copiar productos en Pedidos |
| `8b27436` | control deslizante para el velo blanco del hero |
| `cae1967` | a los 10 s sin actividad la pagina baja sola al catalogo |
| `51e3f84` | etiqueta de ejemplo con envio gratis + alta de cliente guarda el nombre de Google |

## Bancos de prueba (no se commitean, los ignora .gitignore)

Se regeneran con los scripts del scratchpad de la sesion. Si no estan, hay que
volver a escribirlos: son una copia de `index.html` / `admin.html` con los
`<script>` de Firebase reemplazados por un stub inline (auth que devuelve un
admin, Firestore falso con datos de ejemplo), guardadas como `_test-tienda.html`
y `_test-admin.html`. Se sirven con `npm run dev` (puerto 5173).

Dos cosas del entorno que conviene saber antes de medir:
- Con el panel del navegador oculto NO corren `requestAnimationFrame` ni las
  animaciones/transiciones CSS, y los `setTimeout` se estrangulan a ~1 s. Cualquier
  sondeo por tiempo da numeros inventados: usar `MutationObserver` o espiar la
  llamada (por ejemplo pisar `Element.prototype.scrollIntoView`).
- Ahi mismo el scroll queda inerte (`scrollTop=500` devuelve 0) y `document.hidden`
  es `true`.
- `vh` y `dvh` valen lo mismo en ese navegador, asi que un bug de `vh` en movil no
  se reproduce solo: hay que forzar el alto que daria el telefono y medir.

---

## PENDIENTE 1 — La tienda ignora `config/negocio` (envios y minimo de pedido)

Salio al verificar lo del "envio gratis". El panel tiene en Configuracion
`haceEnvios`, `minimoPedido`, `envioPrecio`, `envioGratisActivo` y
`envioGratisDesde`, y **la tienda no lee ninguno**: `grep haceEnvios app.js
index.html` da 0.

Lo que hay hoy escrito a mano en `app.js`:
- `updateShippingBar()` (~linea 799): `const MIN_ORDER=30000, FREE_SHIPPING=100000`.
- El checkout ofrece siempre el toggle envio/retiro (`setCheckoutEntrega`, ~904).

O sea que si el comercio apaga los envios en el panel, el cliente igual ve la
barra de "faltan $X para envio gratis" y puede elegir envio a domicilio. Es el
mismo caso que la tarea 4 (dato del negocio escrito a mano en vez de salir del
panel), pero este toca plata y expectativa del cliente.

No lo hice porque cambia el comportamiento de compra de cara al cliente (minimo
de pedido y costo de envio) y no es un arreglo de una linea: hay que leer
`config/negocio` desde la tienda, esconder el toggle cuando `haceEnvios` es false
y recalcular el total del checkout. Decision del duenio antes de tocarlo.

Ojo con lo que ya dice el contexto de arriba: `config-negocio.js` es solo para el
panel. Esto seria leer `config/negocio` de Firestore desde la tienda, que es otra
cosa.

## PENDIENTE 2 — Los 3 clientes que ya existen siguen sin nombre

El arreglo `51e3f84` guarda el nombre de Google **en las altas nuevas**. Los tres
que ya estan en `clientesAuth` tienen el documento creado, asi que siguen en
blanco. Si se quieren completar hay que hacerlo a mano desde el panel o con un
script de migracion.

## PENDIENTE 3 — El modal "Completa tus datos" solo aparece en el login activo

`_onUserLogin(user, showModal)` recibe `showModal = _loginActivo`, que solo es
true justo despues de apretar "Iniciar sesion". Al restaurar la sesion no se
vuelve a pedir nada, y el modal no tiene boton de cerrar pero se escapa
recargando. Por eso alguien puede comprar sin telefono cargado nunca. Si molesta,
la idea seria volver a pedirlo cuando falten datos y el cliente vaya a comprar.
