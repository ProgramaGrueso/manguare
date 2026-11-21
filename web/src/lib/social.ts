/**
 * Red social de la comunidad (demostración): muro con fotos, match
 * productor↔comprador y mensajes. Todo vive en el teléfono, así que funciona sin
 * conexión. Las funciones son puras: reciben un estado y devuelven otro.
 */
import type { CommunityListing } from './community';

export type ProfileRole = 'productor' | 'comprador' | 'voluntario';

export interface PostComment {
  id: string;
  author: string;
  text: string;
  at: string;
  /** false = aún no llegó al servidor. */
  synced?: boolean;
}

export interface Post {
  id: string;
  author: string;
  community: string;
  text: string;
  photo?: string;
  at: string;
  likes: number;
  likedByMe: boolean;
  comments: PostComment[];
  /** undefined = demostración local; false = pendiente de enviar; true = en el servidor. */
  synced?: boolean;
  /** Mi «me gusta» cambió y falta avisar al servidor. */
  likeDirty?: boolean;
}

export interface MatchProfile {
  id: string;
  name: string;
  role: ProfileRole;
  community: string;
  headline: string;
  about: string;
  tags: string[];
  /** Si ya te dio «me interesa»: al corresponder se produce el match. */
  likesYou: boolean;
  hue: number;
}

export interface ChatMessage {
  id: string;
  from: 'me' | 'them';
  text: string;
  at: string;
}

export interface SocialState {
  posts: Post[];
  swiped: Record<string, 'like' | 'pass'>;
  matches: string[];
  chats: Record<string, ChatMessage[]>;
  /** Publicaciones ya enviadas que borré y falta borrar en el servidor. */
  pendingDeletes: string[];
}

export const ROLE_LABEL: Record<ProfileRole, string> = {
  productor: 'Productor',
  comprador: 'Comprador',
  voluntario: 'Voluntario',
};

const STATE_KEY = 'manguare.social.v1';
const LISTINGS_KEY = 'manguare.listings.v1';

export const MAX_POST_CHARS = 280;
export const MAX_COMMENT_CHARS = 160;
export const MAX_MESSAGE_CHARS = 280;

function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${random}`;
}

function minutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

/** Perfiles de demostración. No representan a personas reales. */
export const MATCH_PROFILES: MatchProfile[] = [
  {
    id: 'p-maria',
    name: 'María Tsamajain',
    role: 'productor',
    community: 'Awajún · Imaza',
    headline: 'Miel pura y cera de abeja',
    about: 'Cosechamos miel sin químicos. Busco compradores que recojan en Chiriaco cada quincena.',
    tags: ['miel', 'alimentos', 'quincenal'],
    likesYou: true,
    hue: 42,
  },
  {
    id: 'p-lucho',
    name: 'Lucho Pérez',
    role: 'comprador',
    community: 'Santa María de Nieva',
    headline: 'Compro cacao y plátano para la feria',
    about: 'Llevo producto a la feria de fin de mes. Pago al contado y coordino el flete.',
    tags: ['cacao', 'plátano', 'feria'],
    likesYou: true,
    hue: 18,
  },
  {
    id: 'p-carlos',
    name: 'Carlos Antún',
    role: 'productor',
    community: 'Wampis · Nieva',
    headline: 'Transporte fluvial por el Marañón',
    about: 'Salidas dos veces por semana. Llevo carga liviana y pasajeros con aviso previo.',
    tags: ['transporte', 'río', 'carga'],
    likesYou: false,
    hue: 200,
  },
  {
    id: 'p-rosa',
    name: 'Rosa Wajajai',
    role: 'productor',
    community: 'Shawi · Balsapuerto',
    headline: 'Tejidos y cestería con fibra natural',
    about: 'Hago bolsos, cestas y collares. Acepto pedidos por encargo con 15 días de anticipación.',
    tags: ['artesanía', 'tejido', 'encargos'],
    likesYou: true,
    hue: 330,
  },
  {
    id: 'p-ana',
    name: 'Ana Quispe',
    role: 'comprador',
    community: 'Tarapoto',
    headline: 'Tienda de productos de la selva',
    about: 'Compro artesanía y alimentos para mi tienda. Valoro el comercio justo y los precios claros.',
    tags: ['tienda', 'comercio justo', 'artesanía'],
    likesYou: false,
    hue: 160,
  },
  {
    id: 'p-jose',
    name: 'José Sánchez',
    role: 'voluntario',
    community: 'Promotor de salud · Imaza',
    headline: 'Apoyo con alertas y botiquines',
    about: 'Ayudo a las familias a registrar alertas y a llegar a la posta cuando vuelve la señal.',
    tags: ['salud', 'alertas', 'capacitación'],
    likesYou: true,
    hue: 120,
  },
  {
    id: 'p-elena',
    name: 'Elena Mayanchi',
    role: 'productor',
    community: 'Awajún · Nazareth',
    headline: 'Yuca, plátano y frutas de chacra',
    about: 'Cosecho cada semana. Si me avisas con dos días de anticipación, preparo tu pedido.',
    tags: ['yuca', 'frutas', 'semanal'],
    likesYou: false,
    hue: 85,
  },
  {
    id: 'p-miguel',
    name: 'Miguel Torres',
    role: 'comprador',
    community: 'Bagua Grande',
    headline: 'Restaurante con cocina amazónica',
    about: 'Busco pescado ahumado, miel y frutas todo el año. Recojo en el puerto.',
    tags: ['restaurante', 'pescado', 'frutas'],
    likesYou: true,
    hue: 8,
  },
];

export function seedState(now: Date = new Date()): SocialState {
  return {
    posts: [
      {
        id: 'post-1',
        author: 'María Tsamajain',
        community: 'Awajún · Imaza',
        text: 'Hoy cosechamos 40 frascos de miel. Quedan 12 para esta semana. Pasen por Chiriaco o coordinen por aquí. 🐝',
        at: minutesAgo(now, 35),
        likes: 18,
        likedByMe: false,
        comments: [
          {
            id: 'c-1',
            author: 'Ana Tuwi',
            text: '¿Tienes para mandar a Nieva el viernes?',
            at: minutesAgo(now, 22),
          },
        ],
      },
      {
        id: 'post-2',
        author: 'José Sánchez',
        community: 'Promotor de salud',
        text: 'Recordatorio: si hay una emergencia y no tienes señal, guarda la alerta en Manguaré. Se envía sola cuando vuelva la conexión.',
        at: minutesAgo(now, 180),
        likes: 31,
        likedByMe: false,
        comments: [],
      },
      {
        id: 'post-3',
        author: 'Carlos Antún',
        community: 'Wampis · Nieva',
        text: 'Salida a Nieva el sábado a las 6 a. m. Aún hay dos cupos. Avisen el jueves.',
        at: minutesAgo(now, 60 * 20),
        likes: 9,
        likedByMe: false,
        comments: [],
      },
    ],
    swiped: {},
    matches: [],
    chats: {},
    pendingDeletes: [],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Valida lo leído del almacenamiento para no romper la app con datos viejos. */
export function normalizeState(value: unknown, now: Date = new Date()): SocialState {
  const fallback = seedState(now);
  if (!isObject(value)) return fallback;
  const posts = Array.isArray(value.posts) ? (value.posts as Post[]) : fallback.posts;
  const swiped = isObject(value.swiped) ? (value.swiped as SocialState['swiped']) : {};
  const matches = Array.isArray(value.matches) ? (value.matches as string[]) : [];
  const chats = isObject(value.chats) ? (value.chats as SocialState['chats']) : {};
  const pendingDeletes = Array.isArray(value.pendingDeletes)
    ? (value.pendingDeletes as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  return { posts, swiped, matches, chats, pendingDeletes };
}

function readStorage(key: string): unknown {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSocialState(): SocialState {
  return normalizeState(readStorage(STATE_KEY));
}

/** Devuelve false si el teléfono no tiene espacio (la app sigue funcionando). */
export function saveSocialState(state: SocialState): boolean {
  return writeStorage(STATE_KEY, state);
}

export function toggleLike(state: SocialState, postId: string): SocialState {
  return {
    ...state,
    posts: state.posts.map((post) =>
      post.id === postId
        ? {
            ...post,
            likedByMe: !post.likedByMe,
            likes: Math.max(0, post.likes + (post.likedByMe ? -1 : 1)),
            likeDirty: post.synced === undefined ? post.likeDirty : true,
          }
        : post,
    ),
  };
}

export function addComment(
  state: SocialState,
  postId: string,
  author: string,
  text: string,
  now: Date = new Date(),
): SocialState {
  const clean = text.trim().slice(0, MAX_COMMENT_CHARS);
  if (!clean) return state;
  const comment: PostComment = {
    id: newId('c'),
    author,
    text: clean,
    at: now.toISOString(),
    synced: false,
  };
  return {
    ...state,
    posts: state.posts.map((post) =>
      post.id === postId ? { ...post, comments: [...post.comments, comment] } : post,
    ),
  };
}

export function addPost(
  state: SocialState,
  input: { author: string; community: string; text: string; photo?: string },
  now: Date = new Date(),
): SocialState {
  const text = input.text.trim().slice(0, MAX_POST_CHARS);
  if (!text && !input.photo) return state;
  const post: Post = {
    id: newId('post'),
    author: input.author,
    community: input.community,
    text,
    photo: input.photo,
    at: now.toISOString(),
    likes: 0,
    likedByMe: false,
    comments: [],
    synced: false,
  };
  return { ...state, posts: [post, ...state.posts] };
}

export function removePost(state: SocialState, postId: string): SocialState {
  const target = state.posts.find((post) => post.id === postId);
  const needsServerDelete = target?.synced === true && !state.pendingDeletes.includes(postId);
  return {
    ...state,
    posts: state.posts.filter((post) => post.id !== postId),
    pendingDeletes: needsServerDelete ? [...state.pendingDeletes, postId] : state.pendingDeletes,
  };
}

/** Perfiles que aún no has visto, en orden. */
export function pendingProfiles(state: SocialState): MatchProfile[] {
  return MATCH_PROFILES.filter((profile) => !state.swiped[profile.id]);
}

export function swipe(
  state: SocialState,
  profileId: string,
  direction: 'like' | 'pass',
): { state: SocialState; matched: boolean } {
  const profile = MATCH_PROFILES.find((item) => item.id === profileId);
  if (!profile || state.swiped[profileId]) return { state, matched: false };
  const matched = direction === 'like' && profile.likesYou;
  return {
    matched,
    state: {
      ...state,
      swiped: { ...state.swiped, [profileId]: direction },
      matches: matched ? [...state.matches, profileId] : state.matches,
    },
  };
}

export function resetSwipes(state: SocialState): SocialState {
  const kept: SocialState['swiped'] = {};
  for (const id of state.matches) kept[id] = 'like';
  return { ...state, swiped: kept };
}

export function sendMessage(
  state: SocialState,
  profileId: string,
  from: ChatMessage['from'],
  text: string,
  now: Date = new Date(),
): SocialState {
  const clean = text.trim().slice(0, MAX_MESSAGE_CHARS);
  if (!clean || !state.matches.includes(profileId)) return state;
  const message: ChatMessage = { id: newId('m'), from, text: clean, at: now.toISOString() };
  return {
    ...state,
    chats: { ...state.chats, [profileId]: [...(state.chats[profileId] ?? []), message] },
  };
}

/** Respuesta automática de demostración (no es una persona real). */
export function demoReply(profile: MatchProfile): string {
  if (profile.role === 'comprador') {
    return '¡Gracias por escribir! Me interesa. ¿Qué cantidad tienes y para cuándo?';
  }
  if (profile.role === 'voluntario') {
    return 'Gracias por contactarme. Cuéntame qué necesitas y vemos cómo ayudar.';
  }
  return 'Gracias por tu mensaje. Tengo disponible; dime cuánto necesitas y coordinamos.';
}

/** «hace 5 min», «hace 3 h», «hace 2 d». */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '');
  return letters.join('') || '?';
}

/* ------------------------------------------------------------------ */
/* Sincronización con el servidor                                      */
/* ------------------------------------------------------------------ */

export type SyncPatch =
  | { type: 'posted'; id: string }
  | { type: 'liked'; id: string; on: boolean }
  | { type: 'commented'; postId: string; commentId: string }
  | { type: 'deleted'; id: string };

/** ¿Hay algo que enviar al servidor? */
export function hasPendingWork(state: SocialState): boolean {
  return (
    state.pendingDeletes.length > 0 ||
    state.posts.some(
      (post) =>
        post.synced === false ||
        post.likeDirty === true ||
        post.comments.some((comment) => comment.synced === false),
    )
  );
}

/**
 * Aplica el resultado de una sincronización al estado MÁS RECIENTE (el usuario
 * pudo seguir usando la app mientras se enviaba). `serverPosts` es null si algún
 * envío falló: en ese caso solo se marcan los envíos que sí llegaron.
 */
export function applySync(
  state: SocialState,
  patches: SyncPatch[],
  serverPosts: Post[] | null,
): SocialState {
  let posts = state.posts;
  let pendingDeletes = state.pendingDeletes;

  for (const patch of patches) {
    if (patch.type === 'posted') {
      posts = posts.map((post) => (post.id === patch.id ? { ...post, synced: true } : post));
    } else if (patch.type === 'liked') {
      posts = posts.map((post) =>
        post.id === patch.id && post.likedByMe === patch.on ? { ...post, likeDirty: false } : post,
      );
    } else if (patch.type === 'commented') {
      posts = posts.map((post) =>
        post.id === patch.postId
          ? {
              ...post,
              comments: post.comments.map((comment) =>
                comment.id === patch.commentId ? { ...comment, synced: true } : comment,
              ),
            }
          : post,
      );
    } else {
      pendingDeletes = pendingDeletes.filter((id) => id !== patch.id);
    }
  }

  if (serverPosts) {
    const localById = new Map(posts.map((post) => [post.id, post]));
    const merged: Post[] = serverPosts
      .filter((post) => !pendingDeletes.includes(post.id))
      .map((server) => {
        const local = localById.get(server.id);
        if (!local) return { ...server, synced: true };
        const unsyncedComments = local.comments.filter(
          (comment) =>
            comment.synced === false && !server.comments.some((item) => item.id === comment.id),
        );
        const keepLike = local.likeDirty === true;
        return {
          ...server,
          synced: true,
          comments: [...server.comments, ...unsyncedComments],
          likedByMe: keepLike ? local.likedByMe : server.likedByMe,
          likes: keepLike ? local.likes : server.likes,
          likeDirty: keepLike ? true : undefined,
        };
      });
    const serverIds = new Set(serverPosts.map((post) => post.id));
    const pending = posts.filter((post) => post.synced === false && !serverIds.has(post.id));
    posts = [...pending, ...merged];
  }

  return { ...state, posts, pendingDeletes };
}

/** Une las publicaciones del servidor con las propias que aún no se enviaron. */
export function mergeListings(
  local: CommunityListing[],
  server: CommunityListing[],
): CommunityListing[] {
  const serverIds = new Set(server.map((listing) => listing.id));
  const pending = local.filter((listing) => listing.synced === false && !serverIds.has(listing.id));
  return [...pending, ...server.map((listing) => ({ ...listing, synced: true }))];
}

/* ------------------------------------------------------------------ */
/* Mercado: publicaciones propias                                      */
/* ------------------------------------------------------------------ */

export interface NewListingInput {
  title: string;
  description: string;
  category: string;
  priceRange: string;
  location: string;
  author: string;
  community?: string;
  coordinates?: { lat: number; lng: number; accuracy?: number };
  photo?: string;
}

export function buildListing(input: NewListingInput): CommunityListing | null {
  const title = input.title.trim().slice(0, 80);
  if (!title) return null;
  return {
    id: newId('mine'),
    category: input.category,
    title,
    description: input.description.trim().slice(0, 400),
    photo: input.photo,
    location: input.location.trim().slice(0, 80),
    rating: 0,
    priceRange: input.priceRange.trim().slice(0, 30),
    author: input.author,
    department: '',
    province: '',
    district: '',
    community: input.community?.trim() ?? '',
    ...(input.coordinates ? { coordinates: input.coordinates } : {}),
    reviews: [],
    synced: false,
  };
}

export function loadUserListings(): CommunityListing[] {
  const value = readStorage(LISTINGS_KEY);
  return Array.isArray(value) ? (value as CommunityListing[]) : [];
}

export function saveUserListings(listings: CommunityListing[]): boolean {
  return writeStorage(LISTINGS_KEY, listings);
}
