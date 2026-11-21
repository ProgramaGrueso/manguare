# Reporte de arquitectura y estructura de Manguaré

Este documento describe qué contiene cada parte del repositorio, cuál es su
responsabilidad y cómo se comunican la PWA, el servidor, el panel y los datos.

## 1. Resumen ejecutivo

Manguaré es un MVP compuesto por una **PWA React** y un **servidor HTTP Node.js**
sin framework ni base de datos externa.

```text
Navegador del teléfono
  ├── React/Vite (app principal)
  ├── IndexedDB (cola y datos locales)
  ├── Service Worker (archivos offline y reintentos en segundo plano)
  └── llamadas fetch a /api/*
            │
            ▼
Servidores Node.js HTTP
  ├── sirve la PWA compilada
  ├── sirve el panel /panel
  ├── valida autenticación y límites
  └── almacena JSON atomáticamente
            │
            ▼
      Archivos JSON en disco
```

La PWA puede crear alertas sin conexión. Las guarda primero en IndexedDB y
después intenta enviarlas a `POST /api/alerts`. Cuando vuelve la red, o cuando
el usuario solicita sincronizar, también descarga por ID el estado actual de
cada alerta confirmada. La misma instancia de servidor sirve la aplicación y las
API, por lo que normalmente no existe CORS ni un dominio distinto entre web y
backend.

## 2. Raíz del proyecto

| Archivo o carpeta | Contenido y función |
| --- | --- |
| `package.json` | Dependencias, requisitos Node >=22 y comandos de desarrollo, compilación, prueba y ejecución. |
| `package-lock.json` | Bloqueo reproducible de versiones npm. |
| `Dockerfile` | Construye la PWA y crea una imagen runtime con Node 22 Alpine. Expone el puerto 8787 y monta `/data`. |
| `docker-compose.yml` | Levanta un servicio `manguare`, publica 8787 y usa el volumen `manguare-data`. |
| `.env.example` | Ejemplo de configuración del panel, sesión, acuse y HTTPS. |
| `README.md` | Introducción general y comandos básicos del proyecto. |
| `HANDOFF.md` | Estado histórico y operativo del MVP, fases, pendientes y decisiones técnicas. |
| `DevUT_proyecto_APA7.pdf` | Propuesta principal: problema, arquitectura conceptual, alertas y sostenibilidad. |
| `Guia_entrevista_sociologo_DevUT.pdf` | Guía de entrevista para validar el uso de la aplicación con comunidades. |
| `server/` | Backend HTTP, almacenes de datos y pruebas del servidor. |
| `web/` | PWA React/TypeScript, panel administrativo, recursos públicos y pruebas web. |
| `scripts/` | Automatizaciones auxiliares, especialmente la prueba E2E con Puppeteer. |
| `docs/` | Operación, demostración, pruebas y capturas del prototipo. |

### Comandos principales

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Ejecuta API en Node watch y Vite en paralelo. |
| `npm run dev:api` | Ejecuta solo el servidor en modo vigilancia. |
| `npm run dev:web` | Ejecuta Vite en el puerto 5173 y proxy `/api` hacia 8787. |
| `npm run build` | Compila la PWA y el panel a `web/dist`. |
| `npm start` | Ejecuta el servidor de producción con archivos compilados. |
| `npm run seed` | Inserta tres alertas de demostración desde `server/scripts/seed.js`. |
| `npm test` | Ejecuta las pruebas de API y web. |
| `npm run test:e2e` | Ejecuta el recorrido completo en Chromium/Puppeteer. |
| `npm run check` | Ejecuta typecheck, pruebas y build. |

## 3. Carpeta `server/`

### Rol general

`server/` contiene el backend que escucha en el puerto 8787, sirve los archivos
compilados de `web/dist`, procesa las API y persiste datos. No requiere Express,
Prisma ni otros servicios externos.

### `server/src/`

| Archivo | Función |
| --- | --- |
| `index.js` | Punto de entrada del proceso Node. Lee variables de entorno, crea los tres almacenes, crea autenticación y abre el servidor HTTP. |
| `app.js` | Ruteo principal de HTTP y API. Sirve archivos estáticos, valida solicitudes, limita intentos y conecta las rutas con los almacenes. |
| `auth.js` | Login mínimo del panel, cookie HTTP-only, sesiones en memoria, comparación segura de credenciales y limitador de intentos. |
| `store.js` | Persistencia de alertas en JSON. Genera confirmaciones, respuestas, escalamientos, auditoría por eventos y actualizaciones de detalle. |
| `biodiversity-store.js` | Persistencia de reportes ambientales en JSON y operación de marcar reportes como leídos. |
| `social-store.js` | Persistencia del muro y el mercado: publicaciones, comentarios, likes, listados y límites por teléfono. |

### Datos administrados por el servidor

| Dato | Archivo por defecto | Uso |
| --- | --- | --- |
| Alertas | `server/data/alerts.json` | Emergencias, ubicación consentida, fotos, acuse, escalamiento y respuestas. |
| Biodiversidad | `server/data/biodiversity.json` | Reportes ambientales y estado de lectura por el panel. |
| Red social | `server/data/social.json` | Publicaciones, comentarios, likes y anuncios del mercado. |

En Docker, los datos pueden quedar en el volumen `/data`. Las escrituras usan
archivos temporales y después renombrean a la ruta final para reducir el riesgo
de corrupción parcial.

### `server/scripts/`

`seed.js` carga alertas de demostración usando `POST /api/alerts` y marca una
como recibida. Está pensado para mostrar el panel sin fabricar datos manualmente.
El servidor debe estar ejecutándose antes de iniciar el seed.

### `server/test/`

| Archivo | Qué verifica |
| --- | --- |
| `api.test.js` | Salud, alertas, idempotencia, edición, límites y comportamiento HTTP. |
| `auth.test.js` | Login, cookies, sesión, cierre y protección del panel. |
| `sla.test.js` | Plazo de acuse, vencimiento y escalamiento automático al consultar alertas. |
| `social.test.js` | Publicaciones, comentarios, likes, anuncios y permisos del muro social. |

## 4. Carpeta `web/`

### Rol general

`web/` contiene dos productos React compilados por la misma configuración Vite:
la app principal para los teléfonos y el panel de la red de salud. Ambos usan
las mismas rutas `fetch` relativas al origen actual.

### Entradas principales

| Archivo | Función |
| --- | --- |
| `index.html` | Entrada HTML de la app PWA. |
| `panel.html` | Entrada HTML separada del panel `/panel`. |
| `vite.config.ts` | Dos entradas de compilación, puerto de desarrollo, proxy `/api`, PWA y rewrite de `/panel`. |
| `tsconfig.json` | Configuración de TypeScript del navegador y las pruebas. |
| `src/main.tsx` | Arranque de React para la PWA y registro del service worker solo en producción. |
| `src/panel-main.tsx` | Arranque de React para el panel administrativo. |
| `src/sw.ts` | Service worker: precarga, navegación offline y sincronización de colas. |
| `public/` | Iconos PWA, favicon, manifest y marca. |
| `dist/` | Artefactos compilados usados por el servidor en producción. Se genera con `npm run build`. |
| `test/` | Pruebas de cola, sesión, SLA y red social del navegador. |

### `web/src/app/`

`AppContext.tsx` centraliza el estado de alertas, reportes ambientales,
conectividad, sincronización, ajustes y operaciones de borrado. `SessionContext`
expone la sesión local del teléfono a las pantallas.

### `web/src/components/`

Contiene componentes reutilizables de interfaz: barra superior e inferior,
tarjetas de alerta, estados, hojas/modal, toast, ubicación, publicación,
idiomas, ayuda, marcas y indicador de conexión.

### `web/src/screens/`

| Pantalla | Función |
| --- | --- |
| `LoginScreen` / `RegisterScreen` | Acceso local de demostración con número/PIN. |
| `HomeScreen` | Inicio, saludo, estado de conexión y acciones rápidas. |
| `NewAlertScreen` | Creación guiada de una emergencia. |
| `AlertDetailScreen` | Estado, detalle y respuesta recibida de una alerta. |
| `HistoryScreen` | Histórico local de alertas. |
| `MapScreen` | Mapa Leaflet con puntos comunitarios y centros. |
| `CommunityScreen` | Publicaciones, categorías y servicios comunitarios. |
| `NetworkScreen` | Red social, mercado, match y asistente local. |
| `BiodiversityReportScreen` | Reporte ambiental offline. |
| `SettingsScreen` | Comunidad, dispositivo, idioma y preferencias offline. |
| `NetworkScreen` | Muro y mercado, con la lógica descrita en `lib/social*`. |

### `web/src/panel/`

`PanelApp.tsx` es la interfaz de la red de salud. Carga el estado de sesión,
alertas y biodiversidad, permite login/logout, aplicar filtros, marcar recibidas,
registrar respuestas rápidas y escalamientos, y visualizar reportes ambientales.

### `web/src/lib/`

| Archivo | Responsabilidad |
| --- | --- |
| `db.ts` | Base IndexedDB `manguare`, objetos `alerts` y `biodiversity-reports`. |
| `queue-core.ts` | Creación local, estados, reintentos, idempotencia y sincronización de alertas. |
| `sync.ts` | Orquestación periódica y manual de sincronización. |
| `retry.ts` | Cálculo de esperas progresivas entre reintentos. |
| `biodiversity.ts` | Cola y sincronización de reportes ambientales. |
| `social.ts` / `social-sync.ts` | Datos sociales y sincronización con las API sociales. |
| `session.ts` | Sesión local de usuario del teléfono. |
| `settings.ts` | Configuración persistida del dispositivo y modo offline simulado. |
| `types.ts` | Modelos compartidos de alertas, reportes y entidades de interfaz. |
| `emergency.ts` / `sms.ts` | Tipos de emergencia, ayuda y construcción de SMS. |
| `geography.ts` / `photo.ts` | Geolocalización, ubicaciones y compresión de imágenes. |
| `audio.ts` | Reproducción de ayudas de audio. |
| `assistant.ts` | Reglas locales del asistente; no usa IA externa ni diagnóstico médico. |
| `community.ts` | Datos demo de categorías, mercado y centros de apoyo. |
| `sla.ts` | Estados y plazos de atención. |
| `format.ts` | Formateo de fechas y datos para la interfaz. |

### Persistencia local del teléfono

`db.ts` usa IndexedDB, no `localStorage`, para las colas principales. Además se
usan sesiones y ajustes en almacenamiento local. Esto permite que una alerta
creada sin señal sobreviva a recargas y cierre de pestaña; la PWA debe haberse
abierto al menos una vez con conexión para que el service worker pueda precargar
la aplicación.

## 5. Carpeta `scripts/`

`e2e.mjs` arranca el servidor con datos temporales y Chromium/Puppeteer. Prueba
condiciones lentas y offline, persistencia en IndexedDB, recuperación de red,
login del panel, confirmación de alertas y navegación social. Requiere que exista
`web/dist` y que Chrome/Edge/Chromium esté instalado.

## 6. Carpeta `docs/`

| Archivo o carpeta | Función |
| --- | --- |
| `DEMO.md` | Guion para presentar y ensayar el MVP. |
| `OPERACION.md` | Ejecución, Docker, variables, HTTPS, respaldo y diagnóstico. |
| `PRUEBAS.md` | Estrategia automatizada y pruebas físicas recomendadas en Android. |
| `capturas/` | Imágenes y HTML usados como evidencia visual o material de demostración. |
| `capturas/fonts/` | Fuentes usadas por las imágenes o páginas de captura. |

## 7. Cómo se conecta cada parte

### Desarrollo

```text
Vite: http://localhost:5173
  └── /api/* → proxy → http://localhost:8787
Node: http://localhost:8787
  └── API + archivos estáticos
```

En desarrollo, Vite entrega la PWA y el panel. Cuando la PWA llama `/api/...`,
Vite reenvía esa petición al servidor Node.

### Producción

```text
Navegador
  └── http://host:8787
       ├── /          → web/dist/index.html
       ├── /panel     → web/dist/panel.html
       └── /api/*     → createHandler()
```

En producción no hace falta un servidor web separado: el servidor Node sirve
React compilado y las API desde el mismo origen.

### Docker

El `Dockerfile` tiene dos fases:

1. **build**: instala npm, copia el proyecto y ejecuta `npm run build`.
2. **runtime**: copia el servidor y `web/dist`, escucha en 8787 y usa `/data`.

Docker Compose publica el puerto y exige una contraseña en
`MANGUARE_PANEL_PASSWORD`. El volumen `manguare-data` conserva datos al recrear
el contenedor.

## 8. API disponibles

### Salud y panel

| Método y ruta | Función |
| --- | --- |
| `GET /api/health` | Estado básico y cantidad de alertas. |
| `GET /api/panel/session` | Indica si el login está habilitado y si existe sesión. |
| `POST /api/panel/login` | Crea la sesión del panel. |
| `POST /api/panel/logout` | Invalida la cookie de sesión. |

### Alertas

| Método y ruta | Función |
| --- | --- |
| `POST /api/alerts` | Crea una alerta; el ID hace el envío idempotente. |
| `GET /api/alerts` | Lista alertas; requiere autenticación si el panel está protegido. |
| `GET /api/alerts/:id` | Consulta una alerta concreta para actualizar estado local. |
| `PATCH /api/alerts/:id` | Actualiza detalles SOS si existe token válido y aún no fue recibida. |
| `POST /api/alerts/:id/received` | Marca recepción y acuse. |
| `POST /api/alerts/:id/escalate` | Registra escalamiento manual por SMS, llamada o canal manual. |
| `POST /api/alerts/:id/responses` | Registra respuesta rápida y confirma recepción. |

### Biodiversidad

| Método y ruta | Función |
| --- | --- |
| `GET /api/biodiversity` | Lista reportes; está protegida si el panel tiene contraseña. |
| `POST /api/biodiversity` | Crea un reporte desde la PWA. |
| `GET /api/biodiversity/:id/status` | Consulta estado de un reporte concreto. |
| `POST /api/biodiversity/:id/read` | Marca un reporte como leído por el panel. |

### Red social

| Método y ruta | Función |
| --- | --- |
| `GET/POST /api/social/posts` | Lista o crea publicaciones. |
| `DELETE /api/social/posts/:id` | Elimina una publicación propia o como administrador. |
| `POST /api/social/posts/:id/like` | Activa o desactiva «me gusta». |
| `POST /api/social/posts/:id/comments` | Agrega un comentario. |
| `GET/POST /api/social/listings` | Lista o crea anuncios del mercado. |
| `DELETE /api/social/listings/:id` | Elimina un anuncio propio o como administrador. |

Las rutas de escritura social requieren el encabezado
`X-Manguare-Phone` con una identidad de 6 a 15 dígitos. Esa identidad sirve para
marcar publicaciones propias y aplicar límites; no constituye autenticación real.

## 9. Flujo principal de una alerta

1. La persona inicia sesión localmente en la PWA.
2. Captura tipo, comunidad, texto, ubicación opcional y foto opcional.
3. La aplicación genera un ID una sola vez y guarda la alerta en IndexedDB.
4. Si hay conexión, intenta `POST /api/alerts`; si no, queda en estado pendiente.
5. El servidor devuelve la alerta creada y calcula su plazo de acuse.
6. El reintento usa el mismo ID, por lo que el servidor no duplica la alerta.
7. El panel autenticado recibe y puede marcar la alerta como recibida.
8. El teléfono consulta periódicamente la alerta por su ID y actualiza el estado
   local a enviada o recibida.
9. Si vence el plazo sin acuse, el servidor la marca como escalada. El panel
   puede abrir SMS o llamada, o registrar una respuesta rápida.

Los estados están diseñados para evitar falsa seguridad: no retroceden
inequívocamente de pendiente a estados superiores.

## 10. Configuración de conexión

### Variables principales

| Variable | Uso |
| --- | --- |
| `PORT` | Puerto HTTP; predeterminado 8787. |
| `HOST` | Interfaz de escucha; predeterminado `0.0.0.0`. |
| `MANGUARE_DATA_FILE` | Ruta JSON de alertas. |
| `MANGUARE_BIODIVERSITY_FILE` | Ruta JSON de biodiversidad. |
| `MANGUARE_SOCIAL_FILE` | Ruta JSON de red social. |
| `MANGUARE_STATIC_DIR` | Directorio de la web compilada. |
| `MANGUARE_PANEL_PASSWORD` | Activa la autenticación del panel. |
| `MANGUARE_PANEL_USER` | Usuario del panel; predeterminado `salud`. |
| `MANGUARE_SESSION_SECRET` | Secreto usado para credenciales y sesiones. |
| `MANGUARE_SESSION_HOURS` | Duración de la sesión del panel. |
| `MANGUARE_ACK_MINUTES` | Plazo de confirmación de alertas. |
| `MANGUARE_ESCALATION_PHONE` | Número que se coloca en el SMS de respaldo. |
| `MANGUARE_SECURE_COOKIES` | Habilita cookies `Secure` detrás de HTTPS. |
| `MANGUARE_TRUST_PROXY` | Permite leer `X-Forwarded-For` solo desde un proxy confiable. |

## 11. Seguridad y límites actuales

- El panel puede protegerse con usuario y contraseña; el login está limitado por IP.
- Las sesiones se guardan en memoria y pueden invalidarse al reiniciar.
- Las operaciones sensibles del panel verifican la cookie de sesión.
- Las APIs públicas de alertas y biodiversidad tienen límites por IP.
- Las rutas sociales tienen límites por teléfono y IP.
- No hay CORS abierto; las llamadas deben compartir el mismo origen.
- El número/PIN de la PWA es una simulación local; no protege datos ni cuenta
  como autenticación real.
- No hay roles, múltiples usuarios panel ni notificaciones push.
- Las fotos se convierten a base64 y las alertas se persisten en archivos JSON.

## 12. Conclusión

La arquitectura es deliberadamente simple para demostrar el escenario offline:
el navegador conserva la cola, el servidor actúa como receptor único y el panel
consume el mismo modelo de datos. Para un piloto real faltan principalmente
persistencia transaccional, usuarios y roles, almacenamiento separado de
archivos, SMS automático, pruebas físicas y protocolo operativo acordado con la
red de salud.
