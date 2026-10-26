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

**Todo dato es ilustrativo.** La IA está en exploración: las respuestas son predefinidas, no hay inferencia ni análisis real. No se envían mensajes ni se recogen datos de pacientes. El control antispam no garantiza entrega ni reemplaza la gestión de consentimiento.

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
```

## Publicación

Sitio estático compatible con GitHub Pages y Vercel. Para GitHub Pages, servir la raíz de la rama principal; `.nojekyll` evita procesamiento Jekyll. Los assets usan rutas relativas para funcionar bajo `/lading-xmetrics/`.

Para Vercel, importar este repositorio con preset Other, sin comando de build y con directorio de salida `.`. Se incluye `vercel.json`.

La landing no copia configuración, credenciales, backend ni bases de datos del sistema original.
