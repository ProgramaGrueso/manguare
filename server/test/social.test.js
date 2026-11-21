import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createHandler } from '../src/app.js';
import { SocialStore } from '../src/social-store.js';
import { AlertStore } from '../src/store.js';

process.env.MANGUARE_LOG = '0';

let server;
let base;
let directory;
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'manguare-social-'));
  const staticDir = path.join(directory, 'static');
  await fs.mkdir(staticDir, { recursive: true });
  const store = new AlertStore(path.join(directory, 'alerts.json'));
  const socialStore = new SocialStore(path.join(directory, 'social.json'));
  server = http.createServer(createHandler({ store, socialStore, staticDir }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(directory, { recursive: true, force: true });
});

async function call(method, url, phone, body) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(phone ? { 'x-manguare-phone': phone } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: await response.json().catch(() => ({})) };
}

test('un servidor vacío arranca con publicaciones de demostración y lectura sin identidad', async () => {
  const { status, json } = await call('GET', '/api/social/posts');
  assert.equal(status, 200);
  assert.ok(json.posts.length >= 2);
  assert.ok(json.posts.every((post) => post.mine === false && !('authorPhone' in post)));
});

test('escribir exige identidad', async () => {
  const { status } = await call('POST', '/api/social/posts', '', { id: 'p-nuevo-1', author: 'Juan', text: 'Hola' });
  assert.equal(status, 401);
});

test('publicar es idempotente y marca «mío» solo para su autor', async () => {
  const body = { id: 'p-idem-001', author: 'Juan', community: 'Imaza', text: 'Cacao listo', photo: JPEG };
  const first = await call('POST', '/api/social/posts', '992066275', body);
  assert.equal(first.status, 201);
  assert.equal(first.json.post.mine, true);
  const again = await call('POST', '/api/social/posts', '992066275', body);
  assert.equal(again.status, 200);
  const other = await call('GET', '/api/social/posts', '987654321');
  const seen = other.json.posts.filter((post) => post.id === 'p-idem-001');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].mine, false);
});

test('valida texto vacío, fotos que no son imagen y ids raros', async () => {
  assert.equal((await call('POST', '/api/social/posts', '992066275', { id: 'p-vacio-1', author: 'Juan', text: ' ' })).status, 400);
  assert.equal(
    (await call('POST', '/api/social/posts', '992066275', { id: 'p-foto-01', author: 'Juan', text: 'x', photo: 'javascript:alert(1)' })).status,
    400,
  );
  assert.equal((await call('POST', '/api/social/posts', '992066275', { id: '../etc', author: 'Juan', text: 'x' })).status, 400);
});

test('el «me gusta» cuenta una vez por teléfono y se puede quitar', async () => {
  await call('POST', '/api/social/posts', '992066275', { id: 'p-like-001', author: 'Juan', text: 'Miel' });
  await call('POST', '/api/social/posts/p-like-001/like', '992066275', { on: true });
  const twice = await call('POST', '/api/social/posts/p-like-001/like', '992066275', { on: true });
  assert.equal(twice.json.post.likes, 1);
  const second = await call('POST', '/api/social/posts/p-like-001/like', '987654321', { on: true });
  assert.equal(second.json.post.likes, 2);
  assert.equal(second.json.post.likedByMe, true);
  const off = await call('POST', '/api/social/posts/p-like-001/like', '987654321', { on: false });
  assert.equal(off.json.post.likes, 1);
  assert.equal((await call('POST', '/api/social/posts/p-like-001/like', '987654321', { on: 'si' })).status, 400);
});

test('los comentarios son idempotentes por id', async () => {
  await call('POST', '/api/social/posts', '992066275', { id: 'p-com-0001', author: 'Juan', text: 'Aviso' });
  const comment = { id: 'c-0001', author: 'Ana', text: '¿Para el viernes?' };
  await call('POST', '/api/social/posts/p-com-0001/comments', '987654321', comment);
  const again = await call('POST', '/api/social/posts/p-com-0001/comments', '987654321', comment);
  assert.equal(again.json.post.comments.length, 1);
  assert.equal((await call('POST', '/api/social/posts/no-existe/comments', '987654321', comment)).status, 404);
});

test('solo el autor borra su publicación', async () => {
  await call('POST', '/api/social/posts', '992066275', { id: 'p-del-0001', author: 'Juan', text: 'Borrar' });
  assert.equal((await call('DELETE', '/api/social/posts/p-del-0001', '987654321')).status, 403);
  assert.equal((await call('DELETE', '/api/social/posts/p-del-0001', '992066275')).status, 200);
  assert.equal((await call('DELETE', '/api/social/posts/p-del-0001', '992066275')).status, 404);
});

test('el mercado guarda publicaciones propias con categoría válida', async () => {
  const listing = {
    id: 'l-0000001',
    title: 'Mochila tejida',
    category: 'vestimenta',
    priceRange: 'S/ 50',
    description: 'Mochila hecha a mano',
    location: 'GPS: -5.15, -78.29',
    community: 'Awajún',
    coordinates: { lat: -5.15, lng: -78.29 },
    author: 'Juan',
    photo: JPEG,
  };
  const created = await call('POST', '/api/social/listings', '992066275', listing);
  assert.equal(created.status, 201);
  assert.equal(created.json.listing.mine, true);
  assert.deepEqual(created.json.listing.coordinates, listing.coordinates);
  assert.equal(created.json.listing.location, listing.location);
  assert.equal(created.json.listing.community, listing.community);
  assert.ok(!('ownerPhone' in created.json.listing));
  assert.equal((await call('POST', '/api/social/listings', '992066275', { ...listing, id: 'l-0000002', category: 'armas' })).status, 400);
  assert.equal(
    (await call('POST', '/api/social/listings', '992066275', {
      ...listing,
      id: 'l-0000003',
      coordinates: { lat: 100, lng: -78 },
    })).status,
    400,
  );
  const list = await call('GET', '/api/social/listings', '987654321');
  assert.equal(list.json.listings.find((item) => item.id === 'l-0000001').mine, false);
  assert.equal((await call('DELETE', '/api/social/listings/l-0000001', '987654321')).status, 403);
  assert.equal((await call('DELETE', '/api/social/listings/l-0000001', '992066275')).status, 200);
});

test('lo guardado sobrevive a un reinicio del almacén', async () => {
  await call('POST', '/api/social/posts', '992066275', { id: 'p-persist1', author: 'Juan', text: 'Persistente' });
  const reopened = new SocialStore(path.join(directory, 'social.json'));
  const posts = await reopened.listPosts('992066275');
  assert.ok(posts.some((post) => post.id === 'p-persist1' && post.mine));
});

test('un mismo teléfono no puede llenar el muro: tope de publicaciones', async () => {
  let last = 0;
  for (let index = 0; index < 41; index += 1) {
    const { status } = await call('POST', '/api/social/posts', '911000111', {
      id: `p-cuota-${String(index).padStart(3, '0')}`,
      author: 'Spam',
      text: `msg ${index}`,
    });
    last = status;
    if (index < 40) assert.equal(status, 201);
  }
  assert.equal(last, 429);
});
