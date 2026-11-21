// Presenta el permiso de ubicación y los avisos de captura en el idioma activo.

import { useTranslation } from '../i18n/LanguageContext';
import { MapZoom } from './MapZoom';
import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LeafletMouseEvent } from 'leaflet';
import { useApp } from '../app/AppContext';
import { getCurrentLocation } from '../lib/geography';
import type { AlertLocation } from '../lib/types';
import 'leaflet/dist/leaflet.css';

const AMAZONAS_CENTER: [number, number] = [-5.15, -77.95];

function MapClick({ onPick }: { onPick: (event: LeafletMouseEvent) => void }) {
  useMapEvents({ click: onPick });
  return null;
}

function MapCenter({ value }: { value?: AlertLocation }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.setView([value.lat, value.lng], Math.max(map.getZoom(), 14));
  }, [map, value?.lat, value?.lng]);
  return null;
}

export function LocationPicker({
  value,
  onChange,
}: {
  value?: AlertLocation;
  onChange: (location: AlertLocation) => void;
}) {
  const { t } = useTranslation();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const { online } = useApp();
  const center: [number, number] = value ? [value.lat, value.lng] : AMAZONAS_CENTER;

  const activateLocation = () => {
    setLocating(true);
    setError('');
    void getCurrentLocation()
      .then(onChange)
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error
            ? reason.message
            : t('locationPicker.noSePudoObtenerElGps'),
        );
      })
      .finally(() => setLocating(false));
  };

  return (
    <div className="location-picker">
      <button
        type="button"
        className="btn btn-secondary btn-block"
        onClick={activateLocation}
        disabled={locating}
      >
        {locating ? t('locationPicker.buscandoUbicacion') : t('locationPicker.activarMiUbicacion')}
      </button>
      <MapContainer
        className="location-picker-map"
        center={center}
        zoom={value ? 14 : 8}
        zoomControl={false}
        scrollWheelZoom
      >
        <MapZoom />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClick
          onPick={(event) =>
            onChange({
              lat: Number(event.latlng.lat.toFixed(6)),
              lng: Number(event.latlng.lng.toFixed(6)),
              accuracy: 0,
              capturedAt: new Date().toISOString(),
            })
          }
        />
        <MapCenter value={value} />
        {value ? (
          <CircleMarker center={[value.lat, value.lng]} radius={9} pathOptions={{ color: '#1e684f' }}>
            <></>
          </CircleMarker>
        ) : null}
      </MapContainer>
      <p className="map-helper">
        {!online
          ? t('locationPicker.sinConexionNoSeVenLasTeselas')
          : value
            ? t('locationPicker.puntoElegidoTocaOtraParteDel')
            : t('locationPicker.tocaElMapaParaElegirUna')}
      </p>
      {error ? <p className="field-error" role="status">{error}</p> : null}
    </div>
  );
}
