// Traduce los rótulos de búsqueda, filtros y permisos del mapa.

import { communityLabel } from '../i18n/labels';
import { translate, type MessageKey } from '../i18n/catalog';
import { LocalizedText, useTranslation } from '../i18n/LanguageContext';
import { MapZoom } from '../components/MapZoom';
import { useEffect, useMemo, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';
import { LocateFixed, Map as MapIcon, MapPin, Search, TriangleAlert } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { COMMUNITY_LISTINGS, SUPPORT_CENTERS } from '../lib/community';
import type { AlertLocation } from '../lib/types';
import 'leaflet/dist/leaflet.css';

type MapKind = 'conecta' | 'support';
type Filter = 'conecta' | 'support';

interface MapResult {
  id: string;
  kind: MapKind;
  name: string;
  category: MessageKey;
  description: string;
  location: string;
  coordinates: { lat: number; lng: number };
}

const RESULTS: MapResult[] = [
  ...COMMUNITY_LISTINGS.filter(
    (listing): listing is typeof listing & { coordinates: { lat: number; lng: number } } =>
      Boolean(listing.coordinates),
  ).map((listing) => ({
    id: listing.id,
    kind: 'conecta' as const,
    name: listing.title,
    category: communityLabel(listing.category, 'map.conecta'),
    description: listing.description,
    location: listing.location,
    coordinates: listing.coordinates,
  })),
  ...SUPPORT_CENTERS.map((center) => ({
    id: center.id,
    kind: 'support' as const,
    name: center.name,
    category: 'map.centroDeApoyo' as const,
    description: center.note,
    location: center.distance,
    coordinates: center.coordinates,
  })),
];

function MapFocus({
  result,
  userLocation,
}: {
  result?: MapResult;
  userLocation?: AlertLocation;
}) {
  const map = useMap();
  useEffect(() => {
    if (result) {
      map.flyTo([result.coordinates.lat, result.coordinates.lng], 14, { duration: 0.6 });
    } else if (userLocation) {
      map.flyTo([userLocation.lat, userLocation.lng], 14, { duration: 0.6 });
    }
  }, [map, result?.id, userLocation?.lat, userLocation?.lng]);
  return null;
}

export function MapScreen({ onSOS }: { onSOS: () => void }) {
  const { online } = useApp();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<Filter, boolean>>({
    conecta: true,
    support: true,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<AlertLocation>();
  const [locationMessage, setLocationMessage] = useState('');
  const [locating, setLocating] = useState(false);

  const results = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    return RESULTS.filter((item) => {
      if (!activeFilters[item.kind]) return false;
      if (!query) return true;
      return [t(item.category), translate('es', item.category)].some((category) =>
        `${item.name} ${category} ${item.location}`.toLocaleLowerCase('es').includes(query),
      );
    });
  }, [activeFilters, search, t]);
  const selected = results.find((item) => item.id === selectedId);

  const activateLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage(t('map.esteNavegadorNoOfreceGeolocalizacion'));
      return;
    }
    setLocating(true);
    setLocationMessage('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy),
          capturedAt: new Date(position.timestamp).toISOString(),
        });
        setLocating(false);
      },
      () => {
        setLocationMessage(t('map.noSePudoObtenerTuUbicacion'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  const selectResult = (item: MapResult) => setSelectedId(item.id);
  const toggleFilter = (filter: Filter) => {
    setActiveFilters((current) => ({ ...current, [filter]: !current[filter] }));
    setSelectedId(null);
  };
  return (
    <div className="screen map-screen">
      <header className="map-screen-head">
        <div>
          <p className="eyebrow"><span className="eyebrow-dot" />{' '}{t('map.exploraTuZona')}</p>
          <h1><LocalizedText id="navigation.map" /></h1>
        </div>
        <button type="button" className="map-sos" onClick={onSOS}>
          <TriangleAlert size={16} aria-hidden="true" /> SOS
        </button>
      </header>

      {!online ? (
        <p className="map-offline-note">{t('map.sinConexionElMapaNoPuede')}</p>
      ) : null}

      <section className="map-controls" aria-label={t('map.buscarYFiltrarEnElMapa')}>
        <button
          type="button"
          className="btn btn-secondary btn-block map-location-button"
          onClick={activateLocation}
          disabled={locating}
        >
          <LocateFixed size={19} aria-hidden="true" />
          {locating ? t('map.buscandoUbicacion') : userLocation ? t('map.actualizarMiUbicacion') : t('map.activarMiUbicacion')}
        </button>
        {locationMessage ? <p className="field-error" role="status">{locationMessage}</p> : null}
        <label className="map-search">
          <Search size={19} aria-hidden="true" />
          <input
            data-testid="map-search-input"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setSelectedId(null);
            }}
            placeholder={t('map.buscaPorNombreOCategoria')}
            aria-label={t('map.buscarPorNombreOCategoria')}
          />
        </label>
        <div className="map-filters" aria-label={t('map.filtros')}>
          <button
            type="button"
            data-testid="map-filter-conecta"
            className={activeFilters.conecta ? 'is-active' : ''}
            aria-pressed={activeFilters.conecta}
            onClick={() => toggleFilter('conecta')}
          >
            {t('map.conecta')}
          </button>
          <button
            type="button"
            data-testid="map-filter-support"
            className={activeFilters.support ? 'is-active' : ''}
            aria-pressed={activeFilters.support}
            onClick={() => toggleFilter('support')}
          >
            {t('map.centroDeApoyo')}
          </button>
        </div>
        {results.length ? (
          <div className="map-result-list" aria-label={t('map.resultadosDeBusqueda')}>
            {results.map((item) => (
              <button
                type="button"
                key={item.id}
                className={selectedId === item.id ? 'is-selected' : ''}
                onClick={() => selectResult(item)}
              >
                <span>{item.name}</span>
                <small>{item.kind === 'conecta' ? t('map.conecta') : t('map.centroDeApoyo')}</small>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="map-results" aria-label={t('map.mapaDePublicacionesYCentrosDe')}>
        <MapContainer
          className="map-canvas"
          center={[-5.0, -77.95]}
          zoom={8}
          zoomControl={false}
          scrollWheelZoom
        >
          <MapZoom />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapFocus result={selected} userLocation={userLocation} />
          {results.map((item) => (
            <CircleMarker
              key={item.id}
              center={[item.coordinates.lat, item.coordinates.lng]}
              radius={selectedId === item.id ? 11 : 8}
              pathOptions={{
                color: item.kind === 'conecta' ? '#1e684f' : '#9a5735',
                fillColor: item.kind === 'conecta' ? '#1e684f' : '#9a5735',
                fillOpacity: 0.92,
                weight: 2,
              }}
              eventHandlers={{ click: () => selectResult(item) }}
            >
              <Popup>
                <strong>{item.name}</strong>
                <br />
                {t(item.category)}
                <br />
                {item.location}
              </Popup>
            </CircleMarker>
          ))}
          {userLocation ? (
            <CircleMarker
              center={[userLocation.lat, userLocation.lng]}
              radius={8}
              pathOptions={{ color: '#fff', fillColor: '#236e8a', fillOpacity: 1, weight: 3 }}
            >
              <Popup>{t('map.tuUbicacionSoloVisibleEnEste')}</Popup>
            </CircleMarker>
          ) : null}
        </MapContainer>
        <p className="map-privacy">
          <MapIcon size={14} aria-hidden="true" />
          {t('map.soloMuestraPublicacionesYCentrosDe')}
        </p>
        {selected ? (
          <article className="map-selected" data-testid="map-selected">
            <span className={`map-selected-pin is-${selected.kind}`}>
              <MapPin size={18} aria-hidden="true" />
            </span>
            <div>
              <strong>{selected.name}</strong>
              <span>{t(selected.category)} · {selected.location}</span>
              <p>{selected.kind === 'support' ? t('community.supportNote') : selected.description}</p>
            </div>
          </article>
        ) : null}
        {results.length === 0 ? (
          <p className="map-empty">{t('map.noEncontramosResultadosConEsosFiltros')}</p>
        ) : null}
      </section>

      <section className="map-suggestions" aria-labelledby="map-suggestions-title">
        <div className="section-head">
          <h2 id="map-suggestions-title">{t('map.centrosDeApoyo')}</h2>
          <span className="demo-badge">{t('map.ubicacionAproximada')}</span>
        </div>
        {SUPPORT_CENTERS.map((center) => (
          <button
            key={center.id}
            type="button"
            className="map-suggestion"
            onClick={() => {
              const result = RESULTS.find((item) => item.id === center.id);
              if (result) selectResult(result);
            }}
          >
            <span className="center-icon"><MapPin size={18} aria-hidden="true" /></span>
            <span>
              <strong>{center.name}</strong>
              <small>{center.distance} · {t('community.supportNote')}</small>
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}
