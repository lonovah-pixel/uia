import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { GeoPoint, Place } from '@uia/core';

const MOSCOW: [number, number] = [55.7558, 37.6173];

const pin = (letter: string, kind: 'from' | 'to') =>
  L.divIcon({
    className: '',
    html: `<div class="map-pin map-pin--${kind}"><span>${letter}</span></div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
  });

const FROM_ICON = pin('А', 'from');
const TO_ICON = pin('Б', 'to');

interface Props {
  from: Place | null;
  to: Place | null;
  geometry?: [number, number][];
  onPick(point: GeoPoint): void;
  onMove(kind: 'from' | 'to', point: GeoPoint): void;
}

function ClickHandler({ onPick }: { onPick(point: GeoPoint): void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng }) });
  return null;
}

/** Держит в кадре обе точки маршрута или одну выбранную. */
function FitView({ from, to, geometry }: Pick<Props, 'from' | 'to' | 'geometry'>) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = [from, to].filter((p): p is Place => p !== null).map((p) => [p.lat, p.lon]);
    if (geometry?.length) points.push(...geometry);
    if (points.length === 1) map.setView(points[0]!, Math.max(map.getZoom(), 14));
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16 });
  }, [map, from, to, geometry]);
  return null;
}

export function MapView({ from, to, geometry, onPick, onMove }: Props) {
  // Если роутер не ответил — рисуем пунктир по прямой
  const line = useMemo<[number, number][] | null>(() => {
    if (geometry?.length) return geometry;
    if (from && to) return [[from.lat, from.lon], [to.lat, to.lon]];
    return null;
  }, [geometry, from, to]);

  const dragHandlers = (kind: 'from' | 'to') => ({
    dragend: (e: L.DragEndEvent) => {
      const { lat, lng } = (e.target as L.Marker).getLatLng();
      onMove(kind, { lat, lon: lng });
    },
  });

  return (
    <MapContainer center={MOSCOW} zoom={11} zoomControl={false} className="map" attributionControl>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      <ClickHandler onPick={onPick} />
      <FitView from={from} to={to} geometry={geometry} />
      {line && (
        <Polyline
          positions={line}
          pathOptions={{ color: '#1f6feb', weight: 5, opacity: 0.85, dashArray: geometry?.length ? undefined : '8 10' }}
        />
      )}
      {from && (
        <Marker position={[from.lat, from.lon]} icon={FROM_ICON} draggable eventHandlers={dragHandlers('from')} />
      )}
      {to && <Marker position={[to.lat, to.lon]} icon={TO_ICON} draggable eventHandlers={dragHandlers('to')} />}
    </MapContainer>
  );
}
