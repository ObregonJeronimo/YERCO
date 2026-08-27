# YERCO — Pendientes

Estado del repo al escribir esto: `main`, todo commiteado y pusheado, árbol limpio.
Último commit: `46c2086` (el perfil del cliente se completa solo al entrar y al comprar).

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
| `4b912b0` | la tienda lee `config/pedidos`: minimo, envios y envio gratis salen del panel |
| `46c2086` | el perfil del cliente se completa al restaurar la sesion y al confirmar un pedido |

## Bancos de prueba (no se commitean, los ignora .gitignore)

Se regeneran con los scripts del scratchpad de la sesion. Si no estan, hay que
volver a escribirlos: son una copia de `index.html` / `admin.html` con los
`<script>` de Firebase reemplazados por un stub inline (auth que devuelve un
admin, Firestore falso con datos de ejemplo), guardadas como `_test-tienda.html`
y `_test-admin.html`. Se sirven con `npm run dev` (puerto 5173).

`_test-tienda.html` ademas sabe pisar `config/pedidos` desde la URL, que es
como se midio el PENDIENTE 1: `?neg=none` (el documento no existe, o sea
produccion hoy), `?neg=off` (envios apagados), `?neg=nogratis`, y los montos
sueltos `?min=50000&envio=3500&gratis=80000`.

Y sabe simular un cliente logueado con la sesion restaurada, que es la unica
forma de medir lo que se escribe en `clientesAuth`: `?user=viejo` (documento ya
creado con el nombre en blanco), `?user=sintel` (con nombre y sin telefono),
`?user=nuevo` (primer login). Toda escritura a Firestore queda registrada en
`window.__writes`. Ojo al armar un carrito a mano para probar el checkout: si el
precio no coincide con el del producto, `reconciliarCarrito()` corta
`confirmCheckout()` antes de escribir nada y parece que el arreglo no anda.

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

## ~~PENDIENTE 1 — La tienda ignora la Configuracion del panel~~ HECHO

Commit `4b912b0`. Tres cosas que estaban mal anotadas acá y conviene no volver a
creer:

- **El documento es `config/pedidos`, no `config/negocio`.** `config/negocio` no
  existe ni existió nunca. El panel guarda en `config/pedidos` (`savePedidosCfg`).
- **No hacía falta tocar reglas.** `match /config/{doc}` ya da lectura pública a
  todo salvo el doc `telegram`, así que la tienda podía leerlo desde siempre.
  Verificado ejecutando el `get()` desde la propia página de producción.
- **No era un bug activo, era uno latente.** `config/pedidos` todavía **no existe**
  en producción: el comercio nunca guardó ese formulario, así que el panel venía
  mostrando sus `PC_DEFAULTS`, que son exactamente los números que la tienda tenía
  escritos a mano (30000 / 2000 / 100000, envíos activos). Nadie estaba viendo un
  dato falso; el desfasaje empezaba el día que se guardara por primera vez.

Los números estaban en cinco lugares, no en uno: el botón Confirmar, la barra del
carrito, los marcadores `30k`/`100k` del HTML, el resumen del checkout y el total
que se guarda en el pedido y se manda por WhatsApp.

Cómo quedó:

- `loadNegocioCfg()` lee `config/pedidos` sin bloquear el render: pinta con lo
  cacheado de la visita anterior (`localStorage`, `yerco_negocio_v1`) y repinta
  cuando responde Firestore, igual que `config/siteContent`.
- Si el documento no existe o la lectura falla, quedan los valores de antes, que
  son los mismos defaults del panel. O sea que **no cambia nada hasta que el
  comercio guarde esa Configuración por primera vez.**
- Con `haceEnvios` en false se esconden la pregunta y los dos botones de entrega
  (no la dirección de retiro, que ahí es lo único útil), el pedido se registra
  como retiro aunque alguien fuerce `setCheckoutEntrega('envio')`, y la barra del
  carrito pasa a medir el mínimo. Sin mínimo y sin envío gratis se esconde entera.

Lo que **no** entró, por si aparece la duda: `descontarStock` sigue siendo solo
del panel. La tienda no toca el stock en ningún momento, así que ese interruptor
no tiene nada que aplicar del lado del cliente. El comentario de `admin.html` que
decía lo contrario quedó corregido en el mismo commit.

## ~~PENDIENTE 2 — Los 3 clientes que ya existen siguen sin nombre~~ HECHO
## ~~PENDIENTE 3 — El modal "Completa tus datos" solo aparece en el login activo~~ HECHO

Los dos en `46c2086`, porque eran el mismo problema visto de dos lados:
`clientesAuth` solo se completaba en el alta o en ese modal, y entre esas dos
puertas no había ninguna otra.

- Al **restaurar la sesión** se completan nombre y apellido con lo que dice Google,
  que lo dice en cada login y no solo en el primero. Eso alcanza a los tres que
  estaban en blanco, sin script de migración ni credenciales: se arreglan solos la
  próxima vez que entren a la tienda.
- Al **confirmar un pedido** se guardan en el perfil los campos que estén vacíos con
  lo que la persona acaba de escribir en el checkout, que ya se los exigía. Nunca
  pisa lo que ya esté cargado.

No hizo falta tocar reglas: `clientesAuth` ya deja al cliente escribir `nombre`,
`apellido`, `telefono` y `direcciones` de su propio documento.

Lo que **no** se hizo, por si vuelve la duda: no se fuerza el modal cuando faltan
datos. Con el arreglo de arriba deja de hacer falta para el caso que preocupaba
(comprar sin teléfono cargado): el checkout ya lo pide y ahora además lo guarda.
El modal sigue apareciendo solo en el login activo y sigue sin botón de cerrar.

---

## PENDIENTE 4 — Las visitas y el último acceso de los clientes web no se guardan

Salió mirando las reglas al hacer lo de arriba. `_onUserLogin()` hace, en cada
primer acceso del día:

```js
ref.update({ ultimoAcceso: serverTimestamp(), visitas: increment(1) })
```

y la regla de `clientesAuth` deja al cliente tocar **solo** `nombre`, `apellido`,
`telefono` y `direcciones` (`firestore.rules:135`, el `hasOnly`). Un cliente no es
admin, así que esa escritura se rechaza siempre, y el error se lo come el
`.catch(e => console.warn(...))` de la línea de al lado.

Consecuencia: en el panel, todo cliente que entra por la web queda con
`visitas: 1` y `ultimoAcceso` clavado en la fecha del alta. Las métricas de
clientes están mal desde que existen.

Esto lo leí de la regla, **no lo medí ejecutando** (haría falta loguearse como un
cliente de verdad). Se confirma en dos segundos mirando el panel: si los clientes
web tienen todos `visitas: 1`, es esto.

Arreglarlo es una decisión, no un tramite: hay que **ampliar la regla** para que el
cliente pueda escribir `ultimoAcceso` y `visitas` en su propio documento, y eso
significa que también podría ponerse las visitas que se le antojen (son datos de
métrica, no de plata, pero ensucian el panel). Las alternativas son moverlo a una
Cloud Function con el Admin SDK, o derivar la métrica de `pedidos` y borrar los
dos campos. Ojo con el orden si se toca la regla: **desplegar reglas ANTES de
pushear el código**, como dice el contexto de arriba.
