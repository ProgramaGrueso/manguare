import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from './app.js';
import { createAuth } from './auth.js';
import { BiodiversityStore } from './biodiversity-store.js';
import { SocialStore } from './social-store.js';
import { AlertStore } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const dataFile = process.env.MANGUARE_DATA_FILE ?? path.join(root, 'server', 'data', 'alerts.json');
const biodiversityFile =
  process.env.MANGUARE_BIODIVERSITY_FILE ?? path.join(root, 'server', 'data', 'biodiversity.json');
const socialFile =
  process.env.MANGUARE_SOCIAL_FILE ?? path.join(root, 'server', 'data', 'social.json');
const staticDir = process.env.MANGUARE_STATIC_DIR ?? path.join(root, 'web', 'dist');

const store = new AlertStore(dataFile);
const biodiversityStore = new BiodiversityStore(biodiversityFile);
const socialStore = new SocialStore(socialFile);
const panelPassword = process.env.MANGUARE_PANEL_PASSWORD ?? '';
const sessionHours = Number(process.env.MANGUARE_SESSION_HOURS ?? 12);
const rawAckMinutes = process.env.MANGUARE_ACK_MINUTES;
const ackMinutes = rawAckMinutes === undefined || rawAckMinutes === '' ? 10 : Number(rawAckMinutes);
const escalationPhone = process.env.MANGUARE_ESCALATION_PHONE ?? '';
const auth = createAuth({
  enabled: Boolean(panelPassword),
  password: panelPassword,
  user: process.env.MANGUARE_PANEL_USER ?? 'salud',
  secret: process.env.MANGUARE_SESSION_SECRET
    ? Buffer.from(process.env.MANGUARE_SESSION_SECRET)
    : undefined,
  ttlMs:
    (Number.isFinite(sessionHours) && sessionHours > 0 ? sessionHours : 12) * 60 * 60 * 1000,
  secureCookies: process.env.MANGUARE_SECURE_COOKIES === '1',
});
console.log('Gemini API Key cargada:', Boolean(process.env.GEMINI_API_KEY));
const server = http.createServer(
  createHandler({
  store,
  biodiversityStore,
  socialStore,
  staticDir,
  auth,
  ackMinutes,
  escalationPhone,
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
}),
);

function lanAddresses() {
  const addresses = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const info of interfaces ?? []) {
      if (info.family === 'IPv4' && !info.internal) addresses.push(info.address);
    }
  }
  return addresses;
}

server.listen(port, host, () => {
  console.log('');
  console.log('  Manguaré · servidor de alertas');
  console.log(`  App:    http://localhost:${port}`);
  console.log(`  Panel:  http://localhost:${port}/panel`);
  for (const address of lanAddresses()) {
    console.log(`  Red:    http://${address}:${port}  (misma Wi-Fi / USB)`);
  }
  console.log(`  Datos:  ${dataFile}`);
  console.log(`  Biodiversidad: ${biodiversityFile}`);
  console.log(`  Red social: ${socialFile}`);
  console.log(`  Web:    ${staticDir}`);
  console.log(
    auth.enabled
      ? `  Panel:  protegido con usuario "${process.env.MANGUARE_PANEL_USER ?? 'salud'}"`
      : '  Panel:  SIN contraseña (modo demostración). Define MANGUARE_PANEL_PASSWORD.',
  );
  console.log(
    `  Acuse:  ${Number.isFinite(ackMinutes) && ackMinutes >= 0 ? ackMinutes : 10} min · ` +
      `Escalamiento: ${escalationPhone || 'sin número configurado'}`,
  );
  if (!fs.existsSync(path.join(staticDir, 'index.html'))) {
    console.log('');
    console.log('  Aviso: no se encontró la web compilada. Ejecuta "npm run build" antes de usar');
    console.log('  el servidor de producción, o usa "npm run dev" para desarrollo.');
  }
  console.log('');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${port} ya está en uso. Cierra el otro proceso o usa PORT=otro.`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\nCerrando Manguaré…');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
