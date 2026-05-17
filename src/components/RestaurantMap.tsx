"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { Restaurant } from "@/lib/supabase/types";
import { KUWAIT_CENTER } from "@/lib/distance";

// Leaflet's default marker icon doesn't resolve under bundlers. Inline the
// CDN URLs once at module load.
const defaultIcon = L.icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

type Props = {
  restaurants: Pick<
    Restaurant,
    "id" | "name" | "lat" | "lng" | "area" | "cuisine"
  >[];
  user?: { lat: number; lng: number } | null;
  selectedId?: string | null;
};

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

export default function RestaurantMap({
  restaurants,
  user,
  selectedId,
}: Props) {
  const center = user ?? KUWAIT_CENTER;
  const selected = useMemo(
    () => restaurants.find((r) => r.id === selectedId) ?? null,
    [restaurants, selectedId],
  );

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={12}
      scrollWheelZoom
      className="h-[420px] w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {restaurants.map((r) => (
        <Marker key={r.id} position={[r.lat, r.lng]}>
          <Popup>
            <div className="text-sm">
              <strong>{r.name}</strong>
              <div className="text-xs text-gray-600">
                {r.cuisine}
                {r.area ? ` · ${r.area}` : ""}
              </div>
              <a
                href={`/restaurants/${r.id}`}
                className="mt-1 inline-block text-orange-700 hover:underline"
              >
                View &amp; book →
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
      {selected && <Recenter lat={selected.lat} lng={selected.lng} />}
      {!selected && user && <Recenter lat={user.lat} lng={user.lng} />}
    </MapContainer>
  );
}
