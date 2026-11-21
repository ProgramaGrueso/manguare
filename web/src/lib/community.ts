import type { LucideIcon } from 'lucide-react';
import { Apple, House, Shirt, Truck, Wrench } from 'lucide-react';

export interface CommunityCategory {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const COMMUNITY_CATEGORIES: CommunityCategory[] = [
  { id: 'transporte', label: 'Transporte', icon: Truck },
  { id: 'vestimenta', label: 'Vestimenta', icon: Shirt },
  { id: 'hogar', label: 'Hogar', icon: House },
  { id: 'alimentos', label: 'Productos alimenticios', icon: Apple },
  { id: 'otros', label: 'Otros', icon: Wrench },
];

export interface CommunityListing {
  id: string;
  category: string;
  title: string;
  description: string;
  photo?: string;
  location: string;
  rating: number;
  priceRange: string;
  author: string;
  department: string;
  province: string;
  district: string;
  community: string;
  coordinates?: { lat: number; lng: number; accuracy?: number };
  reviews: Array<{ name: string; date: string; rating: number; comment: string }>;
  /** Solo publicaciones propias: false = aún no llegó al servidor. */
  synced?: boolean;
  /** El servidor marca las publicaciones del usuario actual. */
  mine?: boolean;
}

/** Datos de demostración tomados del prototipo de Figma. */
export const COMMUNITY_LISTINGS: CommunityListing[] = [
  {
    id: 'miel-comunidad',
    category: 'alimentos',
    title: 'Miel pura de la comunidad',
    description:
      'Miel artesanal cosechada en nuestra comunidad. Atención coordinada y trato cercano para toda la comunidad.',
    location: 'Chiriaco, Imaza',
    rating: 4.9,
    priceRange: 'S/ 20 – 30',
    author: 'María Tsamajain',
    department: 'Amazonas',
    province: 'Bagua',
    district: 'Imaza',
    community: 'Awajún',
    coordinates: { lat: -5.15, lng: -78.29 },
    reviews: [
      {
        name: 'Ana Tuwi',
        date: '12 jun 2025',
        rating: 5,
        comment: 'Muy buena atención y producto de calidad.',
      },
      {
        name: 'José S.',
        date: '03 jun 2025',
        rating: 5,
        comment: 'Entrega coordinada con la comunidad.',
      },
    ],
  },
  {
    id: 'transporte-carlos',
    category: 'transporte',
    title: 'Transporte fluvial Carlos',
    description:
      'Viajes seguros por el río Marañón. Coordina el horario y el punto de encuentro antes de salir.',
    location: 'Santa María de Nieva',
    rating: 4.7,
    priceRange: 'S/ 10 – 20',
    author: 'Carlos Antún',
    department: 'Amazonas',
    province: 'Condorcanqui',
    district: 'Nieva',
    community: 'Wampis',
    coordinates: { lat: -4.59, lng: -77.86 },
    reviews: [
      {
        name: 'Rosa W.',
        date: '08 jun 2025',
        rating: 5,
        comment: 'Viaje puntual y seguro.',
      },
    ],
  },
  {
    id: 'cesteria-rosa',
    category: 'vestimenta',
    title: 'Cestería y bolsos de fibra natural',
    description:
      'Bolsos, cestas y collares tejidos a mano. Pedidos por encargo con 15 días de anticipación.',
    location: 'Balsapuerto',
    rating: 4.8,
    priceRange: 'S/ 35 – 90',
    author: 'Rosa Wajajai',
    department: 'Loreto',
    province: 'Alto Amazonas',
    district: 'Balsapuerto',
    community: 'Shawi',
    coordinates: { lat: -5.83, lng: -76.57 },
    reviews: [],
  },
  {
    id: 'yuca-elena',
    category: 'alimentos',
    title: 'Yuca, plátano y frutas de chacra',
    description:
      'Cosecha semanal. Avisa con dos días de anticipación y preparo tu pedido.',
    location: 'Nazareth, Imaza',
    rating: 4.6,
    priceRange: 'S/ 5 – 15',
    author: 'Elena Mayanchi',
    department: 'Amazonas',
    province: 'Bagua',
    district: 'Imaza',
    community: 'Awajún',
    coordinates: { lat: -5.20, lng: -78.31 },
    reviews: [],
  },
  {
    id: 'hamaca-tejida',
    category: 'hogar',
    title: 'Hamacas tejidas a mano',
    description:
      'Hamacas resistentes de algodón, hechas por encargo. Entrega coordinada con el transporte fluvial.',
    location: 'Santa María de Nieva',
    rating: 4.5,
    priceRange: 'S/ 60 – 120',
    author: 'Teresa Jempekit',
    department: 'Amazonas',
    province: 'Condorcanqui',
    district: 'Nieva',
    community: 'Wampis',
    coordinates: { lat: -4.60, lng: -77.85 },
    reviews: [],
  },
  {
    id: 'reparacion-motores',
    category: 'otros',
    title: 'Reparación de motores peque-peque',
    description:
      'Mantenimiento y repuestos para motores fuera de borda. Atiendo en el puerto o en tu comunidad.',
    location: 'Puerto de Nieva',
    rating: 4.7,
    priceRange: 'S/ 40 – 150',
    author: 'Wilson Chumpi',
    department: 'Amazonas',
    province: 'Condorcanqui',
    district: 'Nieva',
    community: 'Wampis',
    coordinates: { lat: -4.59, lng: -77.87 },
    reviews: [],
  },
];

export interface SupportCenter {
  id: string;
  name: string;
  distance: string;
  note: string;
  coordinates: { lat: number; lng: number };
}

/** Distancias de demostración; no son una ubicación real de la comunidad. */
export const SUPPORT_CENTERS: SupportCenter[] = [
  {
    id: 'hospital-santa-maria',
    name: 'Hospital Santa María',
    distance: '2.1 km',
    note: 'Atención general',
    coordinates: { lat: -4.58, lng: -77.87 },
  },
  {
    id: 'posta-imaza',
    name: 'Posta de salud Imaza',
    distance: '3.2 km',
    note: 'Atención general',
    coordinates: { lat: -5.14, lng: -78.28 },
  },
  {
    id: 'centro-chiriaco',
    name: 'Centro de salud Chiriaco',
    distance: '4.3 km',
    note: 'Atención general',
    coordinates: { lat: -5.13, lng: -78.29 },
  },
];

export const ENVIRONMENT_TOPICS = [
  'Tala ilegal',
  'Caza o pesca ilegal',
  'Contaminación de ríos',
  'Minería ilegal',
  'Incendios',
  'Otro',
] as const;
