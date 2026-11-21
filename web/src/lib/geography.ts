import type { AlertLocation } from './types';

export interface ProvinceOption {
  name: string;
  districts: string[];
}

export interface DepartmentOption {
  name: string;
  provinces: ProvinceOption[];
}

export const COMMUNITY_DEPARTMENTS: DepartmentOption[] = [
  {
    name: 'Amazonas',
    provinces: [
      {
        name: 'Bagua',
        districts: ['Bagua', 'Aramango', 'Copallín', 'El Parco', 'Imaza', 'La Peca'],
      },
      {
        name: 'Condorcanqui',
        districts: ['Nieva', 'El Cenepa', 'Río Santiago'],
      },
      {
        name: 'Chachapoyas',
        districts: ['Chachapoyas', 'Asunción', 'Balsas', 'Huancas', 'Levanto'],
      },
      {
        name: 'Utcubamba',
        districts: ['Bagua Grande', 'Cajaruro', 'Cumba', 'El Milagro', 'Jamalca'],
      },
    ],
  },
  {
    name: 'Loreto',
    provinces: [
      {
        name: 'Maynas',
        districts: ['Iquitos', 'Alto Nanay', 'Fernando Lores', 'Indiana', 'Nauta'],
      },
      {
        name: 'Datem del Marañón',
        districts: ['Barranca', 'Cahuapanas', 'Manseriche', 'Morona', 'Pastaza'],
      },
      {
        name: 'Alto Amazonas',
        districts: ['Yurimaguas', 'Balsapuerto', 'Jeberos', 'Lagunas', 'Santa Cruz'],
      },
    ],
  },
  {
    name: 'San Martín',
    provinces: [
      {
        name: 'Moyobamba',
        districts: ['Moyobamba', 'Calzada', 'Habana', 'Jepelacio', 'Soritor'],
      },
      {
        name: 'San Martín',
        districts: ['Tarapoto', 'Alberto Leveau', 'Cacatachi', 'Chazuta', 'La Banda de Shilcayo'],
      },
      {
        name: 'Rioja',
        districts: ['Rioja', 'Awajún', 'Elías Soplín Vargas', 'Nueva Cajamarca', 'Pardo Miguel'],
      },
    ],
  },
  {
    name: 'Ucayali',
    provinces: [
      {
        name: 'Coronel Portillo',
        districts: ['Callería', 'Campoverde', 'Iparía', 'Manantay', 'Yarinacocha'],
      },
      {
        name: 'Atalaya',
        districts: ['Raymondi', 'Sepahua', 'Tahuanía', 'Yurúa'],
      },
    ],
  },
  {
    name: 'Madre de Dios',
    provinces: [
      {
        name: 'Tambopata',
        districts: ['Tambopata', 'Inambari', 'Las Piedras', 'Laberinto'],
      },
      {
        name: 'Manu',
        districts: ['Manu', 'Fitzcarrald', 'Madre de Dios', 'Huepetuhe'],
      },
    ],
  },
];

export const COMMUNITY_SUGGESTIONS = [
  'Awajún',
  'Wampis',
  'Shawi',
  'Achuar',
  'Kukama Kukamiria',
  'Shipibo-Konibo',
];

export function correctedCommunityName(value: string): string {
  const normalized = value.trim().toLocaleLowerCase('es');
  if (['aguajun', 'aguaruna', 'awajun'].includes(normalized)) return 'Awajún';
  const match = COMMUNITY_SUGGESTIONS.find(
    (community) => community.toLocaleLowerCase('es') === normalized,
  );
  return match ?? value.trim();
}

export function getCurrentLocation(): Promise<AlertLocation> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('Este navegador no ofrece geolocalización.'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy),
          capturedAt: new Date(position.timestamp).toISOString(),
        });
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Se denegó el permiso de ubicación. Permite el GPS en el navegador o indica una ubicación escrita.'
            : error.code === error.POSITION_UNAVAILABLE
              ? 'El dispositivo no pudo determinar la ubicación. Indica una ubicación escrita.'
              : 'La búsqueda de ubicación agotó el tiempo. Intenta de nuevo o indica una ubicación escrita.';
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  });
}
