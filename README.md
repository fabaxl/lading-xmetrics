# xMetrics — Cada experiencia cuenta.

Landing personal, estática e independiente del sistema xMetrics. Presenta NPS, Business Intelligence, contactabilidad por WhatsApp y correo electrónico, y una visión conceptual de IA.

## Ver en local

```bash
npm run dev
```

Abre http://127.0.0.1:8765. Requiere Python 3; no necesita instalación de paquetes ni backend.

## Qué incluye

- Esfera 3D Canvas con perspectiva, órbitas e interacción con el puntero.
- Tarjetas con parallax, entradas al hacer scroll y control para pausar movimiento.
- Simulador NPS, filtros BI y recorrido interactivo.
- Contactabilidad responsable: límites por invitación, intervalos y cierre al responder.
- Diseño adaptable a móviles, teclado y `prefers-reduced-motion`.
- Metodología de captura, segmentación y acción, dimensiones de experiencia y OIRS institucional.
- Demostración interactiva disponible; contacto comercial señalado como próximamente, sin formulario ni envíos automáticos.

**Todo dato es ilustrativo.** La IA está en exploración: las respuestas son predefinidas, no hay inferencia ni análisis real. No se envían mensajes ni se recogen datos de pacientes. El control antispam no garantiza entrega ni reemplaza la gestión de consentimiento.

## Fuente institucional

El contenido se complementó con [xmetrics.cl](https://www.xmetrics.cl/) (consulta: 26 de octubre de 2026). Se adaptó su enfoque sin reproducir porcentajes promocionales como resultados verificados. La OIRS se presenta como alcance institucional sujeto a demostración; esta landing no recibe ni gestiona solicitudes. El correo comercial todavía no está habilitado: no se publican direcciones ni enlaces de envío hasta confirmar un canal operativo. WhatsApp y correo electrónico se describen como capacidades del producto, no como canales de contacto activos de esta landing. La IA conceptual y los controles de contactabilidad se mantienen separados de las afirmaciones de esa fuente.

## Archivos

- `index.html`: contenido y componentes accesibles.
- `static/css/landing.css`: marca, responsive, profundidad y animaciones.
- `static/js/landing.js`: simuladores, navegación, recorrido y movimiento.
- `static/js/landing-orbit.js`: render 3D sin librerías externas.
- `tests/`: verificaciones de contenido y comportamiento con Node.js.

## Verificar

```bash
npm run check
npm test
npm run build
```

## Publicación en Cloudflare Pages

La landing está publicada en [lading-xmetrics.pages.dev](https://lading-xmetrics.pages.dev/).
Los dominios [www.xmetrics.cl](https://www.xmetrics.cl/) y
[xmetrics.cl](https://xmetrics.cl/) están asociados al proyecto desde el
27 de octubre de 2026. Durante la propagación, algunas conexiones pueden seguir
mostrando temporalmente el sitio anterior.

El proyecto `lading-xmetrics` está conectado a `fabaxl/lading-xmetrics` mediante
Git integration. Cada cambio en `main` genera una nueva publicación:


| Opción                 | Valor                                    |
| ---------------------- | ---------------------------------------- |
| Production branch      | `main`                                   |
| Framework preset       | `None`                                   |
| Build command          | `npm run build`                          |
| Build output directory | `dist`                                   |
| Root directory         | Raíz del repositorio (sin subdirectorio) |

El build usa sólo Node.js, sin dependencias. Regenera `dist/` con una lista
permitida: `index.html`, `404.html` y `static/`; excluye archivos ocultos y
rechaza enlaces simbólicos. No publica tests, configuración ni metadatos Git.
`dist/` es generado y no se versiona.

`404.html` evita el fallback SPA de Pages y conserva la marca. Sus rutas desde
`/` funcionan incluso cuando falta una URL anidada. La página principal mantiene
assets relativos para conservar la compatibilidad con GitHub Pages.

Los dominios se asociaron desde **Pages → Dominios personalizados** y sus
registros web apuntan a `lading-xmetrics.pages.dev` mediante Cloudflare. No se
configuraron redirecciones entre apex y www. Los registros de correo heredados
no se modificaron: todavía no representan un servicio de correo habilitado.
El contacto comercial permanece como **Próximamente** hasta configurar un
proveedor de correo del dominio.

Para comprobar una publicación: verificar HTTPS, la portada, los recursos
CSS/JS y una ruta inexistente (debe devolver el 404 de xMetrics). El build no
publica README, pruebas ni otros archivos internos.

Referencias: [HTML estático](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)
y [páginas 404](https://developers.cloudflare.com/pages/configuration/serving-pages/).

## Publicación alternativa

Sitio estático compatible con GitHub Pages y Vercel. Para GitHub Pages, servir la raíz de la rama principal; `.nojekyll` evita procesamiento Jekyll. Los assets de la portada usan rutas relativas para funcionar bajo `/lading-xmetrics/`. El 404 personalizado está diseñado para la raíz de Cloudflare Pages; sus rutas absolutas no están adaptadas a esa subruta de GitHub Pages.

Para Vercel, importar este repositorio con preset Other, sin comando de build y con directorio de salida `.`. Se incluye `vercel.json`.

La landing no copia configuración, credenciales, backend ni bases de datos del sistema original.
