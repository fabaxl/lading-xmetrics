# xMetrics — Cada experiencia cuenta.

Landing personal e independiente del sistema xMetrics, con contenido estático y un formulario comercial en Cloudflare Pages Functions. Presenta NPS, Business Intelligence, contactabilidad por WhatsApp y correo electrónico.

## Ver en local

```bash
npm run dev
```

Abre http://127.0.0.1:8765. Requiere Python 3; el contenido no necesita instalación de paquetes. El formulario permanece deshabilitado en este servidor estático: su API sólo funciona en Cloudflare Pages con configuración explícita.

## Qué incluye

- Esfera 3D Canvas con perspectiva, órbitas e interacción con el puntero.
- Tarjetas con parallax, entradas al hacer scroll y control para pausar movimiento.
- Simulador NPS, filtros BI y recorrido interactivo.
- Contactabilidad responsable: límites por invitación, intervalos y cierre al responder.
- Diseño adaptable a móviles, teclado y `prefers-reduced-motion`.
- Metodología de captura, segmentación y acción, dimensiones de experiencia y OIRS institucional.
- Formulario comercial a `ventas@xmetrics.cl`, protegido con Turnstile y validación en servidor; deshabilitado hasta configurar y activar el servicio.

**Todo dato es ilustrativo.** Las demos no envían mensajes ni recogen datos de pacientes. El formulario comercial, cuando está habilitado, envía sólo la consulta del visitante; advierte que no se incluya información clínica ni datos de pacientes. El control antispam no garantiza entrega ni reemplaza la gestión de consentimiento.

## Fuente institucional

El contenido se complementó con [xmetrics.cl](https://www.xmetrics.cl/) (consulta: 26 de octubre de 2026). Se adaptó su enfoque sin reproducir porcentajes promocionales como resultados verificados. La OIRS se presenta como alcance institucional sujeto a demostración; esta landing no recibe ni gestiona solicitudes OIRS. El formulario se reserva para contacto comercial. La recepción y el envío de correo deben verificarse antes de activarlo; no se presenta un éxito ficticio cuando faltan credenciales. WhatsApp se describe como capacidad del producto, no como canal comercial activo. Los controles de contactabilidad se mantienen separados de las afirmaciones de esa fuente.

## Archivos

- `index.html`: contenido y componentes accesibles.
- `static/css/landing.css`: marca, responsive, profundidad y animaciones.
- `static/js/landing.js`: simuladores, navegación, recorrido y movimiento.
- `static/js/landing-orbit.js`: render 3D sin librerías externas.
- `static/js/landing-contact.js`: estados del formulario y Turnstile.
- `functions/api/contact.js`: verificación de CAPTCHA y envío comercial, sólo en servidor.
- `tests/`: verificaciones de contenido, formulario y API con Node.js, sin envíos reales.

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
permitida: `index.html`, `404.html`, `static/` y `_routes.json`; excluye archivos ocultos y
rechaza enlaces simbólicos. No publica tests, configuración ni metadatos Git.
`dist/` es generado y no se versiona.

`404.html` evita el fallback SPA de Pages y conserva la marca. Sus rutas desde
`/` funcionan incluso cuando falta una URL anidada. La página principal mantiene
assets relativos para conservar la compatibilidad con GitHub Pages.

Los dominios se asociaron desde **Pages → Dominios personalizados** y sus
registros web apuntan a `lading-xmetrics.pages.dev` mediante Cloudflare. No se
configuraron redirecciones entre apex y www. La configuración del correo es independiente de los registros web. El formulario
permanece deshabilitado hasta completar los pasos de activación siguientes.

Para comprobar una publicación: verificar HTTPS, la portada, los recursos
CSS/JS y una ruta inexistente (debe devolver el 404 de xMetrics). El build no
publica README, pruebas ni otros archivos internos.

Referencias: [HTML estático](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)
y [páginas 404](https://developers.cloudflare.com/pages/configuration/serving-pages/).

## Activar el formulario comercial

**Estado del código: preparado, no implica servicio activado.** No poner credenciales
ni datos reales en el repositorio. En **Pages → lading-xmetrics → Configuración →
Variables y secretos**, configurar sólo el entorno de producción:

| Nombre | Tipo | Uso |
| --- | --- | --- |
| `TURNSTILE_SITE_KEY` | Variable pública | Clave del widget, no la clave secreta |
| `TURNSTILE_SECRET_KEY` | Secreto | Validación exclusivamente en servidor |
| `BREVO_API_KEY` | Secreto | Envío transaccional de Brevo, nunca la contraseña SMTP |
| `CONTACT_FORM_ENABLED` | Variable | `true` sólo cuando correo y CAPTCHA estén verificados |

1. Crear un widget Turnstile administrado para `xmetrics.cl`, `www.xmetrics.cl` y
   `lading-xmetrics.pages.dev`. La acción esperada es `contact`.
2. Habilitar recepción de `ventas@xmetrics.cl` y `contacto@xmetrics.cl` con
   Cloudflare Email Routing hacia el destino autorizado por el propietario.
   Verificarlo y sustituir los registros MX/SPF heredados; no crear dos SPF.
3. Crear o activar Brevo Free, autenticar `xmetrics.cl` con sus registros exactos
   y comprobar que el remitente `contacto@xmetrics.cl` puede enviar. El plan
   tiene un límite diario; su activación puede requerir revisión del proveedor.
4. Guardar las variables anteriores, desplegar y realizar **una prueba explícita**
   sin datos clínicos. Confirmar llegada a `ventas@xmetrics.cl`, su reenvío y el
   Reply-To. No activar despachadores ni campañas de la aplicación Django.

La función recibe exclusivamente la consulta comercial, con destinatario fijo
`ventas@xmetrics.cl` y remitente `contacto@xmetrics.cl`. El correo del visitante
va en `Reply-To`, no en `From`. No envía autorespuestas al visitante, no admite
adjuntos y no guarda mensajes en una base de datos. Los proveedores sí procesan
el envío y el buzón de destino conserva el mensaje.

Controles: cuerpo acotado, campos validados, consentimiento, campo trampa,
origen HTTPS permitido, token Turnstile de un uso validado en servidor con
hostname y acción, tiempos de espera, errores sin datos personales y clave de
idempotencia para reintentos del mismo contenido. Un timeout puede significar
que el proveedor aceptó el mensaje: el formulario no afirma entrega en ese caso.
Turnstile **no garantiza ausencia de spam** ni sustituye límites de frecuencia:
revisar cuotas y añadir límites antes de campañas o tráfico elevado.

`GET /api/contact` sólo devuelve activación y clave pública; sin configuración
completa, la UI no permite enviar. Previews y hosts no autorizados fallan cerrados.
`_routes.json` limita las invocaciones de Functions al endpoint de contacto; los
assets siguen siendo estáticos. `functions/` se compila desde la raíz del repo
por Pages Git integration, no se copia como contenido a `dist/`.

Las pruebas automatizadas usan transportes simulados y no sustituyen una prueba
real de recepción. Para QA local, usar claves oficiales de prueba únicamente en
un entorno aislado, nunca publicar un CAPTCHA que siempre aprueba.

Referencias: [Turnstile en servidor](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/),
[Pages Functions](https://developers.cloudflare.com/pages/functions/routing/),
[API de Brevo](https://developers.brevo.com/reference/send-transac-email).

## Publicación alternativa

El contenido estático es compatible con GitHub Pages y Vercel; el formulario no envía allí sin implementar un backend equivalente. En ausencia de API muestra un aviso y permanece deshabilitado. Para GitHub Pages, servir la raíz de la rama principal; `.nojekyll` evita procesamiento Jekyll. Los assets de la portada usan rutas relativas para funcionar bajo `/lading-xmetrics/`. El 404 personalizado está diseñado para la raíz de Cloudflare Pages; sus rutas absolutas no están adaptadas a esa subruta de GitHub Pages.

Para Vercel, importar este repositorio con preset Other, sin comando de build y con directorio de salida `.`. Se incluye `vercel.json`.

La landing no copia configuración, credenciales, backend ni bases de datos del sistema original.
