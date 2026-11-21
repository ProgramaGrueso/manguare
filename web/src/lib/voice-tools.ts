import { COMMUNITY_CATEGORIES } from './community';

export interface ListingFormValues {
  title: string;
  category: string;
  price: string;
  location: string;
  description: string;
  photoAttached?: boolean;
  coordinates?: { lat: number; lng: number; accuracy: number };
}

export type ListingFormPatch = Partial<
  Pick<ListingFormValues, 'title' | 'category' | 'price' | 'location' | 'description'>
>;

export interface ListingValidation {
  valid: boolean;
  missing: Array<keyof Pick<ListingFormValues, 'title' | 'category' | 'price' | 'location' | 'description'>>;
}

export interface ListingFormController {
  getValues(): ListingFormValues;
  getPublicationSnapshot(): string;
  resetForVoice(): void;
  updateFields(patch: ListingFormPatch): { success: boolean; message: string; values: ListingFormValues };
  setCoordinates(coordinates: ListingFormValues['coordinates']): void;
  validateForVoice(): ListingValidation;
  publish(): { success: boolean; message: string };
}

export interface CommunityVoiceController {
  showHome(): void;
  openListingForm(): void;
  getListingForm(): ListingFormController | null;
}

export interface VoiceToolResult {
  success: boolean;
  message: string;
  [key: string]: unknown;
}

export interface VoiceToolContext {
  signal: AbortSignal;
  lastUserUtterance: string;
}

export type VoiceToolHandler = (
  name: string,
  args: Record<string, unknown>,
  context: VoiceToolContext,
) => Promise<unknown> | unknown;

export const VOICE_FUNCTION_DECLARATIONS = [
  {
    name: 'navigate_to_screen',
    description: 'Navega a una pantalla real de Manguaré y devuelve el resultado verificado.',
    parameters: {
      type: 'OBJECT',
      properties: {
        screen: {
          type: 'STRING',
          enum: ['home', 'community', 'network', 'map', 'biodiversity', 'history', 'settings', 'new', 'alert'],
        },
        tab: { type: 'STRING', enum: ['wall', 'match', 'agent'] },
        alertId: { type: 'STRING' },
      },
      required: ['screen'],
    },
  },
  {
    name: 'open_listing_form',
    description: 'Abre Comunidad y el formulario real para publicar un producto o servicio.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_listing_form_schema',
    description: 'Consulta las etiquetas, los límites, categorías y campos requeridos del formulario real.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_listing_form_values',
    description: 'Lee los valores actuales del formulario real y los campos de voz aún requeridos.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'update_listing_form_fields',
    description: 'Actualiza únicamente los campos indicados del formulario real de publicación.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' },
        category: {
          type: 'STRING',
          enum: COMMUNITY_CATEGORIES.map((category) => category.id),
        },
        price: { type: 'STRING' },
        location: { type: 'STRING' },
        description: { type: 'STRING' },
      },
    },
  },
  {
    name: 'validate_listing_form',
    description: 'Valida los datos capturados antes de pedir autorización para publicar.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'use_current_location',
    description: 'Solicita permiso y obtiene coordenadas reales del dispositivo, luego las guarda en Ubicación.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'request_listing_publication_confirmation',
    description: 'Genera un resumen fiel y una confirmación pendiente. No publica.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'publish_listing',
    description: 'Publica mediante el mecanismo real solo después de una confirmación verbal explícita del usuario.',
    parameters: {
      type: 'OBJECT',
      properties: { confirmationId: { type: 'STRING' } },
      required: ['confirmationId'],
    },
  },
  {
    name: 'cancel_listing_publication',
    description: 'Cancela la confirmación pendiente; no publica ni cambia de pantalla.',
    parameters: { type: 'OBJECT', properties: {} },
  },
];

const VOICE_REQUIRED_FIELDS = [
  ['title', 'título'],
  ['category', 'categoría'],
  ['price', 'precio'],
  ['location', 'ubicación'],
  ['description', 'descripción'],
] as const;

export function validateVoiceListing(values: ListingFormValues): ListingValidation {
  const missing = VOICE_REQUIRED_FIELDS
    .filter(([field]) => !values[field].trim())
    .map(([field]) => field);
  return { valid: missing.length === 0, missing: [...missing] };
}

export function voiceListingFieldSchema() {
  return {
    title: { label: 'Título', required: true, maxLength: 80 },
    category: {
      label: 'Categoría',
      required: true,
      options: COMMUNITY_CATEGORIES.map(({ id, label }) => ({ id, label })),
    },
    price: { label: 'Precio', required: true, maxLength: 30 },
    location: {
      label: '¿Dónde te encuentran?',
      required: true,
      maxLength: 80,
      acceptsGpsCoordinates: true,
    },
    description: { label: 'Descripción', required: true, maxLength: 400 },
    photo: { label: 'Foto', required: false },
  };
}

export function isExplicitPublicationConfirmation(utterance: string): boolean {
  const normalized = utterance
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!,.;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    !normalized ||
    /\b(no|cancela|cancelar|espera|todavia|cambio|cambiar|pero|quizas|tal vez|duda)\b/.test(
      normalized,
    )
  ) {
    return false;
  }

  return /^(si|claro|confirmo|autorizo|adelante|hazlo|publica|publicalo|publicala|de acuerdo)( [a-z0-9ñ]+){0,6}$/.test(
    normalized,
  );
}

export function summarizeVoiceListing(values: ListingFormValues): string {
  const category =
    COMMUNITY_CATEGORIES.find((option) => option.id === values.category)?.label ?? values.category;
  const gps = values.coordinates
    ? `Coordenadas GPS exactas: ${values.coordinates.lat}, ${values.coordinates.lng} (precisión aproximada ${values.coordinates.accuracy} m).`
    : 'Sin coordenadas GPS.';
  return [
    `Título: ${values.title.trim()}.`,
    `Categoría: ${category}.`,
    `Precio: ${values.price.trim()}.`,
    `Ubicación: ${values.location.trim()}.`,
    `Descripción: ${values.description.trim()}.`,
    gps,
  ].join(' ');
}
