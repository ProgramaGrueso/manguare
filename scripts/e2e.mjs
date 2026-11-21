/**
 * Prueba de punta a punta del recorrido de la demo, pensada para la fase 3:
 * - carga con CPU limitada (simula un Android de gama baja)
 * - alerta creada sin red y persistida en IndexedDB
 * - sincronización al volver la conexión
 * - panel protegido, confirmación y vuelta del estado al teléfono
 * - cambio de idioma sin red y reproducción del guion de audio de la beta
 * - sin alertas pendientes, la app no consulta el servidor cada 20 s
 *
 * Requiere Chromium/Chrome instalado y `npm run build` hecho.
 * Uso: node scripts/e2e.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer-core';
import { createHandler } from '../server/src/app.js';
import { createAuth } from '../server/src/auth.js';
import { BiodiversityStore } from '../server/src/biodiversity-store.js';
import { AlertStore } from '../server/src/store.js';

process.env.MANGUARE_LOG = '0';

const PASSWORD = 'clave-e2e';
const visualBeta = process.argv.includes('--beta-visual');
const root = path.resolve(import.meta.dirname, '..');
const staticDir = path.join(root, 'web', 'dist');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  ...(process.env.PROGRAMFILES
    ? [path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe')]
    : []),
  ...(process.env['PROGRAMFILES(X86)']
    ? [
        path.join(
          process.env['PROGRAMFILES(X86)'],
          'Microsoft',
          'Edge',
          'Application',
          'msedge.exe',
        ),
      ]
    : []),
  ...(process.env.LOCALAPPDATA
    ? [path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')]
    : []),
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

async function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // siguiente
    }
  }
  throw new Error('No se encontró Chromium/Chrome. Define CHROME_PATH.');
}

// Recorre el selector y las pantallas traducidas con una ventana móvil sin red.
async function checkLanguages(app) {
  await app.bringToFront();
  await app.setViewport({ width: 320, height: 720, isMobile: true, hasTouch: true });
  const languageSelect = '[data-testid="language-select"]';
  await app.waitForSelector(languageSelect);
  await app.select(languageSelect, 'agr');
  await app.waitForFunction(() => document.querySelector('.login-erase')?.textContent?.includes('Esakáut'));
  await app.select(languageSelect, 'es');
  await app.click('[data-testid="demo-user"]');
  await app.click('[data-testid="login-submit"]');
  await app.waitForSelector('[data-testid="sos-button"]');
  await app.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await app.setOfflineMode(true);
  await app.waitForFunction(() => !navigator.onLine);

  const openSettings = async () => {
    await app.click('[data-testid="nav-settings"]');
    await app.waitForSelector('[data-testid="settings-language"]');
  };
  const selectLanguage = async (locale, previous) => {
    await app.click('[data-testid="settings-language"]');
    await app.waitForSelector('[data-testid="language-' + previous + '"][aria-pressed="true"]');
    await app.click('[data-testid="language-' + locale + '"]');
    await app.waitForSelector('[data-testid="language-' + locale + '"]', { hidden: true });
    assert.equal(await app.$eval('[data-testid="nav-settings"]', (item) =>
      item.getAttribute('aria-current')), 'page');
  };

  await openSettings();
  await selectLanguage('agr', 'es');
  assert.equal(await app.$eval('[data-testid="nav-history"] [lang="agr"]', (label) => label.textContent), 'Mina étsejmau aidau');
  await app.click('[data-testid="nav-history"]');
  await app.waitForSelector('.screen.history h1 [lang="agr"]');
  assert.equal(await app.$eval('.screen.history h1', (heading) => heading.textContent), 'Mina étsejmau aidau');
  assert.equal(await app.$eval('[data-testid="nav-home"] [lang="agr"]', (label) => label.textContent), 'Nágkabau');
  await app.waitForSelector('[data-testid="nav-map"] [lang="agr"]');
  assert.equal(await app.$eval('[data-testid="nav-map"] span[lang]', (label) => label.textContent),
    'Núgka dakumkámu');
  assert.ok(await app.$eval('[data-testid="nav-map"]', (button) => button.scrollWidth <= button.clientWidth),
    'la etiqueta de mapa debe caber en una pantalla de 320 px');
  await app.click('[data-testid="nav-home"]');
  const awajunSos = await app.waitForSelector('[data-testid="sos-button"] [lang="agr"]');
  assert.equal(await awajunSos.evaluate((label) => label.textContent), 'Wájimas utújchat');
  assert.ok(await awajunSos.evaluate((label) =>
    label.scrollWidth <= label.clientWidth && label.clientWidth < label.closest('button').clientWidth),
    'el título del SOS en awajún debe caber dentro del botón');
  await openSettings();
  await selectLanguage('es', 'agr');

  await selectLanguage('cbt', 'es');
  assert.equal(await app.$eval('.setting-label [lang="cbt"]', (label) => label.textContent), "Ninanu'");
  assert.equal(await app.$eval('[data-testid="nav-community"] [lang="cbt"]', (label) => label.textContent), "Ninanu'");
  await app.click('[data-testid="nav-community"]');
  await app.waitForFunction(() => document.body.textContent?.includes("Pei'"));
  await openSettings();
  await selectLanguage('es', 'cbt');

  if (visualBeta) {
    await app.evaluate(() => {
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          cancel() {},
          getVoices: () => [],
          speak: (utterance) => { document.body.dataset.guideText = utterance.text; },
        },
      });
      if (!window.SpeechSynthesisUtterance) {
        window.SpeechSynthesisUtterance = function (text) { this.text = text; };
      }
    });
  }
  await app.click('[data-testid="nav-home"]');
  await app.click('.lang-btn');
  await app.waitForSelector('[data-testid="language-es"][aria-pressed="true"]');
  const languageIntro = await app.$eval('[role="dialog"] .sheet-intro', (intro) => intro.textContent);
  assert.equal(languageIntro.includes('La beta mezcla español, términos del idioma elegido y rótulos simulados.'), visualBeta);
  await app.click('[data-testid="language-cni"]');
  const greeting = await app.waitForSelector('[data-testid="home-hello"] [lang="cni"]');
  assert.equal(await greeting.evaluate((label) => label.textContent), 'Kametsa pimpoke, Juan');
  const ashaninkaSos = await app.waitForSelector('[data-testid="sos-button"] [lang="cni"]');
  assert.equal(await ashaninkaSos.evaluate((label) => label.textContent), 'Shintsipaite yabintete');
  const sosMetrics = await ashaninkaSos.evaluate((label) => {
  const button = label.closest('button');
  const style = getComputedStyle(label);
  return {
    text: label.textContent,
    scrollWidth: label.scrollWidth,
    clientWidth: label.clientWidth,
    buttonWidth: button.clientWidth,
    fontSize: style.fontSize,
    letterSpacing: style.letterSpacing,
    whiteSpace: style.whiteSpace,
    display: style.display,
    viewport: { width: innerWidth, height: innerHeight },
  };
});
console.log('ASHANINKA SOS:', JSON.stringify(sosMetrics));
assert.ok(
  sosMetrics.scrollWidth <= sosMetrics.clientWidth &&
  sosMetrics.clientWidth < sosMetrics.buttonWidth,
  'el título del SOS en asháninka debe caber dentro del botón',
);
  assert.equal(await app.$eval('.quick-title [lang="cni"]', (label) => label.textContent), 'Amitakotantsi');
  assert.equal(await app.$eval('[data-testid="nav-community"] [lang="cni"]', (label) => label.textContent), 'Nampitsi');
  if (visualBeta) {
    await app.click('.quick-card--audio');
    const spoken = await app.evaluate(() => document.body.dataset.guideText);
    assert.match(spoken, /Amitakotantsi/);
    assert.match(spoken, /Manguaré guarda tu alerta en el teléfono/);
  }
  await app.click('[data-testid="sos-button"]');
  const sosDialog = '[role="dialog"][aria-label="¿Desea enviar una alerta de emergencia?"]';
  await app.waitForSelector(sosDialog);
  await app.click('[data-testid="sos-confirm-cancel"]');
  await app.waitForSelector(sosDialog, { hidden: true });

  await app.click('[data-testid="nav-community"]');
  await app.waitForFunction(() => document.body.textContent?.includes('Pankotsi'));
  assert.ok(await app.evaluate(() => !document.body.textContent?.includes('Vista beta · Textos simulados')));
  if (visualBeta) {
    assert.equal(await app.$eval('.screen.community h1', (title) => title.textContent), 'Pamosantero Amazonía');
    assert.ok(await app.evaluate(() => document.body.textContent?.includes('Miel pura de la comunidad')));
  }
  await app.click('[data-testid="environment-topic-tala-ilegal"]');
  assert.equal(await app.$eval('label [lang="cni"]', (label) => label.textContent), 'Osankenaitoki');
  assert.equal(await app.$eval('[data-testid="biodiversity-category"]', (input) => input.value), 'Tala ilegal');

  await app.reload({ waitUntil: 'domcontentloaded' });
  await app.waitForSelector('[data-testid="sos-button"]');
  assert.match(await app.$eval('[data-testid="home-hello"]', (label) => label.textContent), /Kametsa pimpoke, Juan/);
  await openSettings();
  await selectLanguage('es', 'cni');
  assert.equal(await app.$eval('[data-testid="nav-map"] span[lang]', (label) => label.textContent), 'Mapa');
  await app.click('[data-testid="nav-home"]');
  assert.match(await app.$eval('[data-testid="home-hello"]', (label) => label.textContent), /Hola, Juan/);
  await app.setOfflineMode(false);
}

async function main() {
  await fs.access(path.join(staticDir, 'index.html')).catch(() => {
    throw new Error('Falta web/dist. Ejecuta "npm run build" antes de la prueba E2E.');
  });

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'manguare-e2e-'));
  const store = new AlertStore(path.join(directory, 'alerts.json'));
  const biodiversityStore = new BiodiversityStore(path.join(directory, 'biodiversity.json'));
  const dniSample = path.join(directory, 'dni-demo.png');
  await fs.writeFile(
    dniSample,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  const auth = createAuth({
    enabled: true,
    password: PASSWORD,
    user: 'salud',
    secret: Buffer.from('secreto-e2e'),
  });
  const server = http.createServer(createHandler({ store, biodiversityStore, staticDir, auth }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const browser = await puppeteer.launch({
    executablePath: await findChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const results = {};
  try {
    const app = await browser.newPage();
    await app.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    // 4x más lento: un equipo de gama baja típico.
    await app.emulateCPUThrottling(4);
    await app.emulateNetworkConditions({
      offline: false,
      download: 1.5 * 1024 * 1024,
      upload: 750 * 1024,
      latency: 120,
    });

    const started = Date.now();
    await app.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await app.waitForSelector('[data-testid="splash"]', { timeout: 15000 });
    await app.click('[data-testid="splash"]');
    await app.waitForSelector('[data-testid="splash"]', { hidden: true, timeout: 5000 });
    await app.waitForSelector('[data-testid="login-phone"]', { timeout: 15000 });
    await app.click('[data-testid="demo-user"]');
    await app.click('[data-testid="login-submit"]');
    await app.waitForSelector('[data-testid="sos-button"]', { timeout: 15000 });
    results.loginMs = Date.now() - started;
    results.greeting = await app.$eval('[data-testid="home-hello"]', (element) =>
      element.textContent?.replace(/\s+/g, ' ').trim(),
    );
    assert.match(results.greeting ?? '', /Hola, Juan/);
    results.loadMs = Date.now() - started;

    const navigation = await app.evaluate(() => {
      const entry = performance.getEntriesByType('navigation')[0];
      return entry
        ? {
            domContentLoaded: Math.round(entry.domContentLoadedEventEnd),
            load: Math.round(entry.loadEventEnd),
          }
        : null;
    });
    results.navigation = navigation;
    assert.ok(results.loadMs < 10000, `la app tardó demasiado en cargar: ${results.loadMs} ms`);

    // 1. Crear la alerta sin red.
    await app.setOfflineMode(true);
    await app.waitForFunction(() => navigator.onLine === false, { timeout: 5000 });
    await app.click('[data-testid="nav-history"]');
    await app.click('.history > button.btn-danger');
    await app.click('[data-testid="type-mordedura"]');
    await app.waitForSelector('[data-testid="continue-button"]');
    await app.type('input[placeholder^="Ej. Nueva Esperanza"]', 'Comunidad E2E');
    await app.click('[data-testid="continue-button"]');
    await app.waitForSelector('[data-testid="submit-alert"]');
    await app.click('[data-testid="submit-alert"]');

    await app.waitForFunction(
      () => document.querySelector('[data-testid="alert-state"]')?.textContent === 'Pendiente',
      { timeout: 10000 },
    );
    results.offlineState = 'Pendiente';

    // 2. La cola sobrevive a recargar la app (IndexedDB, no memoria).
    const queued = await app.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open('manguare');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('alerts', 'readonly');
            const all = tx.objectStore('alerts').getAll();
            all.onsuccess = () => resolve(all.result.length);
            all.onerror = () => reject(all.error);
          };
        }),
    );
    assert.equal(queued, 1, 'la alerta debe quedar guardada en IndexedDB');
    await app.reload({ waitUntil: 'domcontentloaded' });
    await app.waitForSelector('[data-testid="sos-button"]', { timeout: 15000 });
    results.persistedAfterReload = true;

    // 3. Volver la conexión y reintentar.
    await app.setOfflineMode(false);
    await app.emulateNetworkConditions({
      offline: false,
      download: -1,
      upload: -1,
      latency: 0,
    });
    await app.waitForFunction(() => navigator.onLine === true, { timeout: 5000 });
    await app.reload({ waitUntil: 'domcontentloaded' });
    await app.waitForSelector('[data-testid="sos-button"]', { timeout: 15000 });
    await app.click('[data-testid="nav-history"]');
    const card = await app.waitForSelector('[data-testid^="alert-"]', { timeout: 10000 });
    await card.click();
    await app.waitForSelector('[data-testid="alert-state"]', { timeout: 10000 });
    await app.click('[data-testid="refresh-status"]');
    await app.waitForFunction(
      () => document.querySelector('[data-testid="alert-state"]')?.textContent === 'Enviada',
      { timeout: 30000 },
    );
    results.onlineState = 'Enviada';

    // 4. Panel protegido: login, confirmación y auditoría.
    const panel = await browser.newPage();
    await panel.setViewport({ width: 1280, height: 900 });
    await panel.goto(`${base}/panel`, { waitUntil: 'domcontentloaded' });
    await panel.waitForSelector('[data-testid="login-password"]', { timeout: 10000 });
    await panel.type('[data-testid="login-password"]', PASSWORD);
    await panel.select('[data-testid="language-select"]', 'cni');
    assert.ok(await panel.$eval('[data-testid="login-password"]', (input) => input.value.length > 0));
    await panel.select('[data-testid="language-select"]', 'es');
    await panel.click('[data-testid="login-submit"]');
    await panel.bringToFront();
    await panel.waitForSelector('[data-testid^="ack-"]', { timeout: 15000 });
    await panel.waitForFunction(() => document.body.textContent?.includes('Reportó Juan'), {
      timeout: 5000,
    });
    await panel.select('[data-testid="language-select"]', 'cbt');
    assert.ok(await panel.$('[data-testid^="ack-"]'), 'el panel conserva la sesión al cambiar el idioma');
    await panel.select('[data-testid="language-select"]', 'es');
    results.panelReporter = true;
    const ackButton = await panel.$('[data-testid^="ack-"]');
    await ackButton.click();
    await panel.waitForFunction(
      () => document.body.textContent?.includes('Recibida'),
      { timeout: 10000 },
    );
    const panelCookies = await panel.cookies();
    assert.ok(
      panelCookies.some((cookie) => cookie.name === 'manguare_session' && cookie.httpOnly),
      'la cookie de sesión debe ser HttpOnly',
    );
    results.panelConfirmed = true;

    // La red deja una indicación para la comunidad.
    await panel.click('.panel-detail');
    await panel.waitForSelector('[data-testid="respond-en_camino"]', { timeout: 5000 });
    await panel.click('[data-testid="respond-en_camino"]');
    await panel.waitForFunction(
      () => document.body.textContent?.includes('Ambulancia o brigada en camino'),
      { timeout: 10000 },
    );
    await panel.click('.panel-modal .panel-detail--large');
    await panel.waitForSelector('.panel-modal', { hidden: true, timeout: 5000 });
    results.panelResponse = true;

    // 5. El teléfono recibe la confirmación y la respuesta.
    await app.bringToFront();
    await app.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="refresh-status"]');
        return button instanceof HTMLButtonElement && !button.disabled;
      },
      { timeout: 15000 },
    );
    await app.click('[data-testid="refresh-status"]');
    await app.waitForFunction(
      () => document.querySelector('[data-testid="alert-state"]')?.textContent === 'Recibida',
      { timeout: 45000 },
    );
    await app.waitForFunction(
      () => document.body.textContent?.includes('Ambulancia o brigada en camino'),
      { timeout: 10000 },
    );
    results.appResponse = true;
    results.receivedState = 'Recibida';

    // 6. Sin pendientes, no debe consultar cada 20 s (batería/datos).
    // Deja terminar cualquier sincronización en curso antes de medir.
    await new Promise((resolve) => setTimeout(resolve, 6000));
    let apiRequests = 0;
    const countRequest = (request) => {
      if (request.url().includes('/api/')) apiRequests += 1;
    };
    app.on('request', countRequest);
    await new Promise((resolve) => setTimeout(resolve, 3500));
    app.off('request', countRequest);
    results.idleApiRequestsIn3s = apiRequests;
    assert.ok(
      apiRequests === 0,
      `con la cola vacía no debería consultar el servidor: ${apiRequests} solicitudes`,
    );

    // 7. SOS mínimo, detalle sobre la misma alerta y lectura desde el panel.
    await app.click('[data-testid="nav-home"]');
    const alertCountBeforeSos = (await store.list()).length;
    await app.click('[data-testid="sos-button"]');
    await app.click('[data-testid="sos-confirm-cancel"]');
    await app.waitForFunction(
      () => !document.querySelector('[data-testid="sos-confirm-send"]'),
      { timeout: 5000 },
    );
    assert.equal((await store.list()).length, alertCountBeforeSos, 'No debe enviar al elegir No');

    await app.click('[data-testid="sos-button"]');
    await app.click('[data-testid="sos-confirm-send"]');
    await app.waitForSelector('[data-testid="sos-detail-open"]', { timeout: 15000 });
    await app.waitForFunction(
      () => document.querySelector('[data-testid="alert-state"]')?.textContent === 'Enviada',
      { timeout: 15000 },
    );
    await app.click('[data-testid="sos-detail-open"]');
    await app.type('[data-testid="sos-detail-reference"]', 'Río de la comunidad');
    await app.type('[data-testid="sos-detail-description"]', 'Necesitamos apoyo en la ribera.');
    await app.click('[data-testid="sos-detail-save"]');
    await app.waitForFunction(
      () => !document.querySelector('[data-testid="sos-detail-save"]'),
      { timeout: 10000 },
    );
    const sosAlerts = (await store.list()).filter((alert) => alert.isSos);
    assert.equal(sosAlerts.length, 1, 'El detalle debe actualizar la misma alerta SOS');
    assert.equal(sosAlerts[0].note, 'Necesitamos apoyo en la ribera.');
    assert.equal(sosAlerts[0].community, 'Río de la comunidad');
    results.sosDetailUpdatedExistingAlert = true;

    await panel.bringToFront();
    const sosAckSelector = `[data-testid="ack-${sosAlerts[0].id}"]`;
    await panel.waitForSelector(sosAckSelector, { timeout: 10000 });
    await panel.click(sosAckSelector);
    await panel.waitForFunction(
      (selector) => !document.querySelector(selector),
      { timeout: 10000 },
      sosAckSelector,
    );
    await app.bringToFront();
    await app.waitForFunction(() => {
      const button = document.querySelector('[data-testid="refresh-status"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    }, { timeout: 15000 });
    await app.click('[data-testid="refresh-status"]');
    await app.waitForFunction(
      () => document.querySelector('[data-testid="alert-state"]')?.textContent === 'Recibida',
      { timeout: 15000 },
    );
    await app.click('[data-testid="nav-history"]');
    await app.waitForFunction(() => document.body.textContent?.includes('Recibida'), {
      timeout: 10000,
    });
    results.sosReceivedStateInProfile = true;

    // 8. Publicaciones, detalle y reporte de biodiversidad.
    await app.bringToFront();
    await app.click('[data-testid="nav-community"]');
    await app.waitForFunction(
      () => document.body.textContent?.includes('Miel pura de la comunidad'),
      { timeout: 5000 },
    );
    const communityText = await app.evaluate(() => document.body.innerText);
    assert.ok(communityText.includes('Hospital Santa María'), 'faltan los centros de apoyo');
    assert.ok(communityText.includes('Alerta Amazonía'), 'falta la sección ambiental');

    await app.click('[data-testid="listings-view-all"]');
    await app.waitForFunction(() => document.body.textContent?.includes('Todas las publicaciones'));
    await app.click('.community-card-button');
    await app.waitForFunction(
      () => document.body.textContent?.includes('Rango de precio') &&
        document.body.textContent?.includes('Reseñas'),
    );
    await app.click('button[aria-label="Volver"]');
    await app.waitForFunction(() => document.body.textContent?.includes('Todas las publicaciones'));
    await app.click('button[aria-label="Volver"]');
    await app.waitForFunction(() => document.body.textContent?.includes('Conecta Amazonía'));

    await app.click('[data-testid="environment-topic-tala-ilegal"]');
    await app.waitForSelector('[data-testid="biodiversity-category"]');
    assert.equal(
      await app.$eval('[data-testid="biodiversity-category"]', (element) => element.value),
      'Tala ilegal',
    );
    await app.type('[data-testid="biodiversity-title"]', 'Tala junto a la quebrada');
    await app.type(
      '[data-testid="biodiversity-description"]',
      'Se observan árboles cortados cerca del camino comunal.',
    );
    await app.click('[data-testid="biodiversity-submit"]');
    await app.waitForFunction(
      () => document.querySelector('[data-testid="biodiversity-state"]')?.textContent === 'Enviada',
      { timeout: 15000 },
    );
    const report = (await biodiversityStore.list())[0];
    assert.equal(report.category, 'Tala ilegal');
    assert.equal(report.title, 'Tala junto a la quebrada');
    await app.click('[data-testid="nav-history"]');
    const reportSelector = `[data-testid="biodiversity-report-${report.id}"]`;
    await app.waitForSelector(reportSelector, { timeout: 10000 });
    assert.ok(
      (await app.$eval(reportSelector, (element) => element.textContent)).includes('Enviada'),
    );
    await panel.bringToFront();
    await panel.waitForSelector(`[data-testid="bio-${report.id}"]`, { timeout: 10000 });
    await panel.click(`[data-testid="bio-read-${report.id}"]`);
    await panel.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-testid="bio-${id}"]`)
          ?.textContent?.includes('Leída'),
      { timeout: 10000 },
      report.id,
    );
    await app.bringToFront();
    await app.click('[data-testid="history-refresh"]');
    await app.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent?.includes('Leída'),
      { timeout: 10000 },
      reportSelector,
    );
    results.publicationDetails = true;
    results.biodiversityAvailableAndRead = true;

    // 8b. Red Manguaré: muro con likes y publicación, match con chat, asistente y mercado.
    await app.click('[data-testid="nav-network"]');
    await app.waitForSelector('[data-testid="net-post"]', { timeout: 10000 });
    await app.click('[data-testid="net-like"]');
    assert.equal(
      await app.$eval('[data-testid="net-like"]', (element) => element.getAttribute('aria-pressed')),
      'true',
    );
    await app.click('[data-testid="net-compose"]');
    await app.type('#net-text', 'Cosecha de cacao lista para la feria');
    await app.click('[data-testid="net-publish"]');
    await app.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="net-post"]')
          ?.textContent?.includes('Cosecha de cacao lista para la feria'),
      { timeout: 10000 },
    );
    await app.click('[data-testid="net-tab-match"]');
    await app.waitForSelector('[data-testid="net-profile"]', { timeout: 10000 });
    await app.click('[data-testid="net-interest"]');
    await app.waitForFunction(
      () => document.body.textContent?.includes('¡Hicieron match!'),
      { timeout: 10000 },
    );
    await app.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((item) =>
        item.textContent?.includes('Enviar mensaje'),
      );
      button?.click();
    });
    await app.waitForSelector('[data-testid="net-chat-input"]', { timeout: 10000 });
    await app.type('[data-testid="net-chat-input"]', 'Hola, ¿tienes miel disponible?');
    await app.keyboard.press('Enter');
    await app.waitForFunction(
      () => document.querySelectorAll('.net-bubble').length >= 2,
      { timeout: 10000 },
    );
    await app.keyboard.press('Escape');
    await app.click('[data-testid="net-tab-agent"]');
    await app.type('[data-testid="net-agent-input"]', 'Tengo una emergencia');
    await app.keyboard.press('Enter');
    await app.waitForFunction(
      () => document.querySelector('[data-testid="net-agent-chat"]')?.textContent?.includes('Crear alerta'),
      { timeout: 10000 },
    );
    await app.click('[data-testid="nav-community"]');
    await app.click('[data-testid="listing-open-publish"]');
    await app.type('[data-testid="listing-title"]', 'Cacao orgánico de chacra');
    await app.click('[data-testid="listing-publish"]');
    await app.waitForFunction(
      () => document.body.textContent?.includes('Cacao orgánico de chacra'),
      { timeout: 10000 },
    );
    results.networkWallMatchAgentMarket = true;

    // 8c. Gemini Live usa herramientas reales; se simula el transporte para probar
    // la integración React sin requerir credenciales externas en CI.
    await app.browserContext().overridePermissions(base, ['microphone', 'geolocation']);
    await app.setGeolocation({ latitude: -5.15, longitude: -78.29 });
    await app.evaluate(() => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (String(input).includes('/api/gemini/token')) {
          return Promise.resolve(new Response(JSON.stringify({
            token: 'test-ephemeral-token',
            model: 'gemini-3.8-live',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return nativeFetch(input, init);
      };

      class FakeNode {
        connect() { return this; }
        disconnect() {}
      }
      class FakeAudioContext {
        state = 'running';
        sampleRate = 48000;
        currentTime = 0;
        destination = new FakeNode();
        async resume() {}
        async close() { this.state = 'closed'; }
        createMediaStreamSource() { return new FakeNode(); }
        createScriptProcessor() { return Object.assign(new FakeNode(), { onaudioprocess: null }); }
        createGain() { return Object.assign(new FakeNode(), { gain: { value: 1 } }); }
        createBuffer(_channels, length) {
          return { duration: length / 24000, getChannelData: () => new Float32Array(length) };
        }
        createBufferSource() {
          return Object.assign(new FakeNode(), {
            buffer: null,
            onended: null,
            start() {},
            stop() { this.onended?.(); },
          });
        }
      }
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext });
      let stoppedTracks = 0;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => ({
            getTracks: () => [{ stop: () => { stoppedTracks += 1; } }],
          }),
        },
      });

      class FakeWebSocket {
        static OPEN = 1;
        static CONNECTING = 0;
        readyState = FakeWebSocket.CONNECTING;
        onopen = null;
        onmessage = null;
        onerror = null;
        onclose = null;
        constructor() {
          window.__geminiMock.socket = this;
          window.setTimeout(() => {
            this.readyState = FakeWebSocket.OPEN;
            this.onopen?.({});
          }, 0);
        }
        send(raw) {
          const message = JSON.parse(raw);
          if (message.setup) {
            window.__geminiMock.setup = message.setup;
            window.setTimeout(() => this.onmessage?.({ data: JSON.stringify({ setupComplete: true }) }), 0);
          }
          if (message.toolResponse) {
            window.__geminiMock.responses.push(...message.toolResponse.functionResponses);
          }
        }
        close() { this.readyState = 3; }
      }
      Object.defineProperty(window, 'WebSocket', { configurable: true, value: FakeWebSocket });
      window.__geminiMock = {
        socket: null,
        setup: null,
        responses: [],
        stoppedTracks: () => stoppedTracks,
        emit: (message) => window.__geminiMock.socket?.onmessage?.({ data: JSON.stringify(message) }),
      };
    });

    await app.click('[data-testid="nav-network"]');
    await app.click('[data-testid="net-tab-agent"]');
    await app.click('[data-testid="net-open-voice"]');
    await app.click('.voice-start');
    await app.waitForFunction(
      () => document.querySelector('.voice-active-status')?.textContent?.includes('Te estoy escuchando'),
      { timeout: 10000 },
    );
    await app.waitForSelector('[data-testid="voice-active-controls"]', { visible: true });
    const emitVoiceTool = async (id, name, args = {}) => {
      await app.evaluate(
        ({ toolId, toolName, toolArgs }) =>
          window.__geminiMock.emit({
            toolCall: { functionCalls: [{ id: toolId, name: toolName, args: toolArgs }] },
          }),
        { toolId: id, toolName: name, toolArgs: args },
      );
      await app.waitForFunction(
        (toolId) => window.__geminiMock.responses.some((response) => response.id === toolId),
        { timeout: 10000 },
        id,
      );
      return app.evaluate(
        (toolId) => window.__geminiMock.responses.find((response) => response.id === toolId).response.result,
        id,
      );
    };
    await app.evaluate(() => window.__geminiMock.emit({
      serverContent: { inputTranscription: { text: 'Quiero vender una mochila', finished: true } },
    }));
    const openedListingForm = await emitVoiceTool('voice-open-listing', 'open_listing_form');
    assert.equal(openedListingForm.success, true);
    assert.equal(openedListingForm.verified, true);
    assert.equal(await app.$eval('[data-testid="app-screen"]', (element) => element.dataset.screen), 'community');
    await app.waitForSelector('[data-testid="listing-title"]', { timeout: 5000 });
    const activeControls = await app.$eval('[data-testid="voice-active-controls"]', (element) => ({
      height: element.getBoundingClientRect().height,
      cancelLabel: element.querySelector('.voice-close')?.getAttribute('aria-label'),
    }));
    assert.ok(activeControls.height < 100);
    assert.equal(activeControls.cancelLabel, 'Cancelar llamada');
    const formHitTarget = await app.$eval('[data-testid="listing-title"]', (element) => {
      const bounds = element.getBoundingClientRect();
      return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2) === element;
    });
    assert.equal(formHitTarget, true);
    const schema = await emitVoiceTool('voice-listing-schema', 'get_listing_form_schema');
    assert.equal(schema.fields.title.required, true);
    assert.equal(schema.fields.description.required, true);
    assert.equal(schema.fields.photo.required, false);

    await emitVoiceTool('voice-update-initial', 'update_listing_form_fields', {
      title: 'Mochila tejida',
      category: 'vestimenta',
      price: 'S/ 50',
    });
    await app.waitForFunction(
      () => document.querySelector('[data-testid="listing-title"]')?.value === 'Mochila tejida',
    );
    assert.equal(await app.$eval('[data-testid="listing-price"]', (element) => element.value), 'S/ 50');
    const incomplete = await emitVoiceTool('voice-validate-incomplete', 'validate_listing_form');
    assert.equal(incomplete.valid, false);
    assert.deepEqual(incomplete.missingRequiredFields, ['location', 'description']);

    const gpsResult = await emitVoiceTool('voice-use-gps', 'use_current_location');
    assert.equal(gpsResult.success, true);
    assert.ok(gpsResult.coordinates.accuracy >= 0);
    await app.waitForFunction(
      () => document.querySelector('[data-testid="listing-location"]')?.value.startsWith('GPS: '),
    );
    await emitVoiceTool('voice-update-description', 'update_listing_form_fields', {
      description: 'Mochila tejida a mano',
    });
    const completeForm = await emitVoiceTool('voice-validate-complete', 'validate_listing_form');
    assert.equal(completeForm.valid, true);

    const publicationConfirmation = await emitVoiceTool(
      'voice-prepare-publication',
      'request_listing_publication_confirmation',
    );
    assert.equal(publicationConfirmation.success, true);
    assert.ok(publicationConfirmation.summary.includes('Mochila tejida'));
    assert.ok(publicationConfirmation.summary.includes('GPS exactas'));
    await app.evaluate(() => window.__geminiMock.emit({
      serverContent: { inputTranscription: { text: 'No, cancela', finished: true } },
    }));
    const rejectedPublication = await emitVoiceTool('voice-reject-publication', 'publish_listing', {
      confirmationId: publicationConfirmation.confirmationId,
    });
    assert.equal(rejectedPublication.success, false);
    const savedAfterReject = await app.evaluate(() => JSON.parse(localStorage.getItem('manguare.listings.v1') || '[]'));
    assert.ok(!savedAfterReject.some((item) => item.title === 'Mochila tejida'));

    await app.evaluate(() => window.__geminiMock.emit({
      serverContent: { inputTranscription: { text: 'Sí, publica la mochila', finished: true } },
    }));
    const published = await emitVoiceTool('voice-confirm-publication', 'publish_listing', {
      confirmationId: publicationConfirmation.confirmationId,
    });
    assert.equal(published.success, true);
    await app.waitForFunction(
      () => JSON.parse(localStorage.getItem('manguare.listings.v1') || '[]')
        .some((item) => item.title === 'Mochila tejida'),
      { timeout: 5000 },
    );
    const savedListing = await app.evaluate(() =>
      JSON.parse(localStorage.getItem('manguare.listings.v1') || '[]')
        .find((item) => item.title === 'Mochila tejida'),
    );
    assert.deepEqual(savedListing.coordinates, gpsResult.coordinates);
    assert.equal(savedListing.priceRange, 'S/ 50');
    assert.equal(savedListing.description, 'Mochila tejida a mano');
    assert.ok(!savedListing.community.includes('Mi comunidad'));
    results.voiceListingToolsAndExplicitConfirmation = true;

    await app.click('.voice-close');
    await app.click('[data-testid="listing-open-publish"]');
    await app.click('[data-testid="listing-voice-assistant"]');
    await app.click('.voice-start');
    await app.waitForFunction(
      () => document.querySelector('.voice-active-status')?.textContent?.includes('Te estoy escuchando'),
      { timeout: 10000 },
    );
    await app.click('.voice-close');
    assert.equal(await app.$eval('[data-testid="app-screen"]', (element) => element.dataset.screen), 'community');
    await app.waitForSelector('[data-testid="listing-title"]', { timeout: 5000 });
    const stoppedFromCommunity = await app.evaluate(() => window.__geminiMock.stoppedTracks());
    assert.ok(stoppedFromCommunity >= 1);
    results.voiceCancelKeepsCommunity = true;

    await app.click('[aria-label="Cerrar"]');
    await app.click('[data-testid="nav-network"]');
    await app.click('[data-testid="net-tab-agent"]');
    await app.click('[data-testid="net-open-voice"]');
    await app.click('.voice-start');
    await app.waitForFunction(
      () => document.querySelector('.voice-active-status')?.textContent?.includes('Te estoy escuchando'),
      { timeout: 10000 },
    );
    await app.click('.voice-close');
    assert.equal(await app.$eval('[data-testid="app-screen"]', (element) => element.dataset.screen), 'network');
    results.voiceCancelKeepsOtherScreen = true;

    // 9. Mapa: solo Conecta y centros de apoyo; ubica y enfoca resultados.
    await app.click('[data-testid="nav-map"]');
    await app.waitForSelector('[data-testid="map-filter-conecta"]', { timeout: 15000 });
    const mapFilters = await app.$$eval('.map-filters button', (buttons) =>
      buttons.map((button) => button.textContent?.trim()),
    );
    assert.deepEqual(mapFilters, ['Conecta', 'Centro de apoyo']);
    await app.browserContext().overridePermissions(base, ['geolocation']);
    await app.setGeolocation({ latitude: -5.9, longitude: -76.1 });
    await app.click('.map-location-button');
    await app.waitForFunction(() => document.body.textContent?.includes('Actualizar mi ubicación'));
    await app.type('[data-testid="map-search-input"]', 'Hospital');
    await app.waitForFunction(
      () => document.querySelector('.map-result-list')?.textContent?.includes('Hospital'),
    );
    await app.click('.map-result-list button');
    await app.waitForSelector('[data-testid="map-selected"]');
    assert.ok(
      (await app.$eval('[data-testid="map-selected"]', (element) => element.textContent)).includes(
        'Hospital',
      ),
    );
    results.mapLocationAndFilters = true;

    // 10. Cerrar sesión y completar registro local con DNI de demostración.
    await app.click('[data-testid="nav-settings"]');
    await app.click('[data-testid="logout-button"]');
    await app.waitForSelector('[data-testid="login-phone"]', { timeout: 5000 });
    await app.click('[data-testid="register-link"]');
    await app.waitForSelector('[data-testid="register-submit"]');

    await app.type('[data-testid="register-phone"]', '123');
    await app.type('[data-testid="register-email"]', 'correo-invalido');
    await app.click('[data-testid="register-submit"]');
    await app.waitForFunction(
      () =>
        document.body.textContent?.includes('Usa 9 dígitos y empieza con 9') &&
        document.body.textContent?.includes('Escribe un correo válido.'),
    );
    await app.select('[data-testid="language-select"]', 'cni');
    await app.waitForFunction(() => document.body.textContent?.includes('Pisankenatero pibajiro.'));
    assert.equal(await app.$eval('[data-testid="register-email"]', (input) => input.value), 'correo-invalido');
    await app.select('[data-testid="language-select"]', 'es');

    await app.click('[data-testid="register-first-name"]');
    await app.type('[data-testid="register-first-name"]', 'Ana');
    await app.type('[data-testid="register-last-name"]', 'Demo');
    await app.click('[data-testid="register-phone"]');
    await app.keyboard.down('Control');
    await app.keyboard.press('A');
    await app.keyboard.up('Control');
    await app.keyboard.press('Backspace');
    await app.type('[data-testid="register-phone"]', '923456789');
    await app.click('[data-testid="register-email"]');
    await app.keyboard.down('Control');
    await app.keyboard.press('A');
    await app.keyboard.up('Control');
    await app.keyboard.press('Backspace');
    await app.type('[data-testid="register-email"]', 'ana.demo@example.com');
    await app.select('[data-testid="register-department"]', 'Amazonas');
    await app.select('[data-testid="register-province"]', 'Bagua');
    await app.select('[data-testid="register-district"]', 'Bagua');
    await app.type('[data-testid="register-community"]', 'aguajun');
    await app.type('[data-testid="register-address"]', 'Cerca del río');
    await app.type('[data-testid="register-pin"]', '654321');
    await app.type('[data-testid="register-pin-confirm"]', '654321');
    await app.click('[data-testid="register-leader-yes"]');
    await (await app.$('[data-testid="register-dni-front"]')).uploadFile(dniSample);
    await (await app.$('[data-testid="register-dni-back"]')).uploadFile(dniSample);
    await app.waitForSelector('img[alt="Vista previa Frontal del DNI"]');
    await app.waitForSelector('img[alt="Vista previa Posterior del DNI"]');
    await app.click('[data-testid="register-submit"]');
    await app.waitForSelector('[data-testid="register-accept"]', { timeout: 5000 });
    await app.click('[data-testid="register-accept"]');
    await app.waitForFunction(() =>
      document.body.textContent?.includes('Tu solicitud de líder quedó registrada localmente'),
    );
    await app.click('[data-testid="register-continue"]');
    await app.waitForFunction(() => document.body.textContent?.includes('Hola, Ana'));
    await app.click('[data-testid="nav-settings"]');
    await app.click('[data-testid="logout-button"]');
    await app.waitForSelector('[data-testid="login-phone"]');
    await app.type('[data-testid="login-phone"]', '923456789');
    for (const digit of '654321') await app.click(`[data-testid="login-key-${digit}"]`);
    await app.click('[data-testid="login-submit"]');
    await app.waitForFunction(() => document.body.textContent?.includes('Hola, Ana'));
    results.registrationValidationAndLocalLogin = true;

    // 11. Cerrar sesión de la app vuelve al acceso.
    await app.click('[data-testid="nav-settings"]');
    await app.click('[data-testid="logout-button"]');
    await app.waitForSelector('[data-testid="login-phone"]', { timeout: 5000 });
    results.appLogoutWorks = true;

    // 12. Cerrar sesión deja el panel bloqueado.
    await panel.bringToFront();
    await panel.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((item) =>
        item.textContent?.includes('Salir'),
      );
      button?.click();
    });
    await panel.waitForSelector('[data-testid="login-password"]', { timeout: 10000 });
    results.logoutWorks = true;

    await checkLanguages(app);
    results.languagesOfflineAndPersisted = true;

    console.log('\nE2E OK');
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('\nE2E FALLÓ');
  console.error(error);
  process.exitCode = 1;
});
