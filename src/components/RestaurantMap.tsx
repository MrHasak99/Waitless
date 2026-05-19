"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import type { Restaurant } from "@/lib/supabase/types";
import { KUWAIT_CENTER, formatDistance } from "@/lib/distance";

// Leaflet's default marker icon doesn't resolve under bundlers. Inline the
// CDN URLs once at module load.
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

// Cuisine-tinted divIcons so different categories stand out visually.
const cuisineColor: Record<string, string> = {
  Mediterranean: "#0ea5e9",
  Levantine: "#16a34a",
  American: "#c2410c",
  Kuwaiti: "#a16207",
  Default: "#6b7280",
};

function pinIcon(color: string) {
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 44' width='32' height='44'>
      <path d='M16 0C7.16 0 0 7.16 0 16c0 11.5 14.34 26.5 15.05 27.2a1.36 1.36 0 0 0 1.9 0C17.66 42.5 32 27.5 32 16 32 7.16 24.84 0 16 0z' fill='${color}' stroke='white' stroke-width='2'/>
      <circle cx='16' cy='16' r='6' fill='white'/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [32, 44],
    iconAnchor: [16, 44],
    popupAnchor: [0, -38],
  });
}

type Props = {
  restaurants: (Pick<
    Restaurant,
    "id" | "name" | "lat" | "lng" | "area" | "cuisine"
  > & { distanceKm?: number })[];
  user?: { lat: number; lng: number } | null;
  selectedId?: string | null;
  distanceUnit?: "km" | "mi";
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
  distanceUnit = "km",
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
      <MarkerClusterGroup chunkedLoading maxClusterRadius={50}>
        {restaurants.map((r) => {
          const color =
            cuisineColor[r.cuisine ?? "Default"] ?? cuisineColor.Default;
          return (
            <Marker key={r.id} position={[r.lat, r.lng]} icon={pinIcon(color)}>
              <Popup>
                <div className="text-sm">
                  <strong>{r.name}</strong>
                  <div className="text-xs text-gray-600">
                    {r.cuisine}
                    {r.area ? ` · ${r.area}` : ""}
                    {typeof r.distanceKm === "number" &&
                      ` · ${formatDistance(r.distanceKm, distanceUnit)}`}
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
          );
        })}
      </MarkerClusterGroup>
      {selected && <Recenter lat={selected.lat} lng={selected.lng} />}
      {!selected && user && <Recenter lat={user.lat} lng={user.lng} />}
    </MapContainer>
  );
}
