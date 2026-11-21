import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ASSISTANT_SUGGESTIONS, assistantReply } from '../src/lib/assistant.ts';
import {
  addComment,
  addPost,
  applySync,
  hasPendingWork,
  mergeListings,
  buildListing,
  demoReply,
  initials,
  MATCH_PROFILES,
  normalizeState,
  pendingProfiles,
  removePost,
  resetSwipes,
  seedState,
  sendMessage,
  swipe,
  timeAgo,
  toggleLike,
} from '../src/lib/social.ts';

const NOW = new Date('2026-11-19T15:00:00Z');

describe('muro', () => {
  it('da y quita «me gusta» sin bajar de cero', () => {
    const state = seedState(NOW);
    const id = state.posts[0]!.id;
    const liked = toggleLike(state, id);
    assert.equal(liked.posts[0]!.likedByMe, true);
    assert.equal(liked.posts[0]!.likes, state.posts[0]!.likes + 1);
    const back = toggleLike(liked, id);
    assert.equal(back.posts[0]!.likes, state.posts[0]!.likes);
  });

  it('agrega comentarios, recorta el texto y descarta los vacíos', () => {
    const state = seedState(NOW);
    const id = state.posts[1]!.id;
    assert.equal(addComment(state, id, 'Juan', '   ', NOW), state);
    const next = addComment(state, id, 'Juan', 'x'.repeat(500), NOW);
    assert.equal(next.posts[1]!.comments.length, 1);
    assert.equal(next.posts[1]!.comments[0]!.text.length, 160);
  });

  it('publica arriba, exige texto o foto y permite eliminar', () => {
    const state = seedState(NOW);
    assert.equal(addPost(state, { author: 'Juan', community: 'X', text: '  ' }, NOW), state);
    const withPhoto = addPost(
      state,
      { author: 'Juan', community: 'X', text: '', photo: 'data:image/jpeg;base64,AA' },
      NOW,
    );
    assert.equal(withPhoto.posts.length, state.posts.length + 1);
    assert.equal(withPhoto.posts[0]!.author, 'Juan');
    const removed = removePost(withPhoto, withPhoto.posts[0]!.id);
    assert.equal(removed.posts.length, state.posts.length);
  });

  it('ignora datos guardados corruptos', () => {
    assert.equal(normalizeState('basura', NOW).posts.length, seedState(NOW).posts.length);
    const odd = normalizeState({ posts: 3, swiped: [], matches: 'x', chats: null }, NOW);
    assert.deepEqual(odd.matches, []);
    assert.ok(Array.isArray(odd.posts));
  });
});

describe('match', () => {
  const liker = MATCH_PROFILES.find((profile) => profile.likesYou)!;
  const cold = MATCH_PROFILES.find((profile) => !profile.likesYou)!;

  it('hace match solo si el perfil ya se interesó', () => {
    const state = seedState(NOW);
    const yes = swipe(state, liker.id, 'like');
    assert.equal(yes.matched, true);
    assert.deepEqual(yes.state.matches, [liker.id]);
    const no = swipe(state, cold.id, 'like');
    assert.equal(no.matched, false);
    assert.deepEqual(no.state.matches, []);
  });

  it('no repite perfiles ni cuenta dos veces el mismo swipe', () => {
    const state = seedState(NOW);
    const first = swipe(state, liker.id, 'like').state;
    const again = swipe(first, liker.id, 'like');
    assert.equal(again.matched, false);
    assert.equal(again.state.matches.length, 1);
    assert.equal(pendingProfiles(first).length, MATCH_PROFILES.length - 1);
  });

  it('reiniciar conserva los matches y devuelve los descartados', () => {
    let state = seedState(NOW);
    state = swipe(state, liker.id, 'like').state;
    state = swipe(state, cold.id, 'pass').state;
    const reset = resetSwipes(state);
    assert.deepEqual(reset.matches, [liker.id]);
    assert.ok(pendingProfiles(reset).some((profile) => profile.id === cold.id));
    assert.ok(!pendingProfiles(reset).some((profile) => profile.id === liker.id));
  });

  it('solo permite mensajes con perfiles que hicieron match', () => {
    const state = seedState(NOW);
    assert.equal(sendMessage(state, liker.id, 'me', 'Hola', NOW), state);
    const matched = swipe(state, liker.id, 'like').state;
    const sent = sendMessage(matched, liker.id, 'me', ' Hola ', NOW);
    assert.equal(sent.chats[liker.id]![0]!.text, 'Hola');
    assert.ok(demoReply(liker).length > 0);
  });
});

describe('mercado', () => {
  it('crea una publicación sin inventar precio, ubicación o coordenadas y exige título', () => {
    assert.equal(
      buildListing({ title: ' ', description: '', category: 'otros', priceRange: '', location: '', author: 'Juan' }),
      null,
    );
    const listing = buildListing({
      title: 'Miel',
      description: '',
      category: 'alimentos',
      priceRange: '',
      location: '',
      author: 'Juan',
    })!;
    assert.equal(listing.priceRange, '');
    assert.equal(listing.location, '');
    assert.equal(listing.description, '');
    assert.equal(listing.coordinates, undefined);
    assert.equal(listing.reviews.length, 0);
  });

  it('conserva las coordenadas reales cuando el usuario las proporciona', () => {
    const coordinates = { lat: -5.15, lng: -78.29 };
    const listing = buildListing({
      title: 'Mochila',
      description: 'Hecha a mano',
      category: 'vestimenta',
      priceRange: 'S/ 50',
      location: 'GPS: -5.15, -78.29',
      author: 'Juan',
      coordinates,
    });
    assert.deepEqual(listing?.coordinates, coordinates);
  });
});

describe('utilidades', () => {
  it('formatea el tiempo y las iniciales', () => {
    assert.equal(timeAgo('2026-11-19T14:59:40Z', NOW), 'ahora');
    assert.equal(timeAgo('2026-11-19T14:30:00Z', NOW), 'hace 30 min');
    assert.equal(timeAgo('2026-11-19T10:00:00Z', NOW), 'hace 5 h');
    assert.equal(timeAgo('2026-11-17T15:00:00Z', NOW), 'hace 2 d');
    assert.equal(initials('María Tsamajain'), 'MT');
    assert.equal(initials(''), '?');
  });
});

describe('asistente', () => {
  it('ante una emergencia dirige a crear la alerta y no da consejos médicos', () => {
    const reply = assistantReply('Me mordió una serpiente, es una EMERGENCIA');
    assert.equal(reply.action, 'new-alert');
    assert.match(reply.text, /no soy personal de salud/i);
  });

  it('prioriza la emergencia sobre otros temas', () => {
    assert.equal(assistantReply('quiero vender miel pero hay un accidente').action, 'new-alert');
  });

  it('entiende acentos, ventas, match y la falta de señal', () => {
    assert.equal(assistantReply('¿Cómo vendo mi miel?').action, 'community');
    assert.equal(assistantReply('busco compradores').action, 'match');
    assert.match(assistantReply('No tengo señal').text, /Pendiente/);
    assert.match(assistantReply('¿Dónde está la posta?').text, /Posta de salud Imaza|Hospital/);
  });

  it('responde algo útil a entradas vacías o desconocidas', () => {
    assert.ok(assistantReply('').text.length > 0);
    assert.match(assistantReply('asdfgh').text, /No estoy seguro/);
  });

  it('todas las sugerencias reciben una respuesta propia', () => {
    for (const suggestion of ASSISTANT_SUGGESTIONS) {
      assert.doesNotMatch(assistantReply(suggestion).text, /No estoy seguro/, suggestion);
    }
  });
});

describe('sincronización', () => {
  const serverPost = (id: string, likes = 0) => ({
    id,
    author: 'Otra',
    community: 'X',
    text: 'hola',
    at: NOW.toISOString(),
    likes,
    likedByMe: false,
    comments: [],
  });

  it('marca como pendiente lo nuevo y lo limpia al enviarse', () => {
    let state = addPost(seedState(NOW), { author: 'Juan', community: 'X', text: 'Hola' }, NOW);
    const id = state.posts[0]!.id;
    assert.equal(hasPendingWork(state), true);
    state = applySync(state, [{ type: 'posted', id }], null);
    assert.equal(state.posts[0]!.synced, true);
    assert.equal(hasPendingWork(state), false);
  });

  it('el servidor manda, pero conserva lo mío sin enviar y mi «me gusta» pendiente', () => {
    let state = addPost(seedState(NOW), { author: 'Juan', community: 'X', text: 'Nuevo' }, NOW);
    const mine = state.posts[0]!.id;
    state = applySync(state, [{ type: 'posted', id: 'otro' }], [serverPost('a', 2)]);
    assert.deepEqual(state.posts.map((post) => post.id), [mine, 'a']);
    state = toggleLike(state, 'a');
    assert.equal(state.posts[1]!.likeDirty, true);
    const merged = applySync(state, [], [serverPost('a', 2)]);
    assert.equal(merged.posts[1]!.likedByMe, true);
    assert.equal(merged.posts[1]!.likes, 3);
  });

  it('borrar una publicación enviada queda pendiente hasta avisar al servidor', () => {
    let state = applySync(seedState(NOW), [], [serverPost('a')]);
    state = removePost(state, 'a');
    assert.deepEqual(state.pendingDeletes, ['a']);
    const stale = applySync(state, [], [serverPost('a')]);
    assert.equal(stale.posts.length, 0);
    assert.deepEqual(applySync(state, [{ type: 'deleted', id: 'a' }], null).pendingDeletes, []);
  });

  it('mezcla mercado: lo propio pendiente primero, luego el servidor', () => {
    const base = buildListing({ title: 'Miel', description: '', category: 'alimentos', priceRange: '', location: '', author: 'J' })!;
    const server = { ...base, id: 'srv', synced: undefined };
    const out = mergeListings([base], [server]);
    assert.deepEqual(out.map((item) => item.id), [base.id, 'srv']);
    assert.equal(mergeListings([base], [{ ...base }]).length, 1);
  });
});
