import { TileLayer } from "react-leaflet";
import L from "leaflet";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerIconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import { useClientConfig } from "../config/clientConfig";

/** Used only if the server's settings could not be loaded, so maps still render. */
const FALLBACK_TILES = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

/** Leaflet's default marker, bundled with the app instead of loaded from a CDN. */
export const markerIcon = new L.Icon({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIconRetinaUrl,
  shadowUrl: markerShadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

/** Basemap from MAP_TILE_URL; renders nothing when the server turned the basemap off. */
export function BaseTileLayer() {
  const { config, error } = useClientConfig();
  const tiles = config ? config.mapTiles : error ? FALLBACK_TILES : null;
  if (!tiles) return null;
  return <TileLayer key={tiles.url} url={tiles.url} attribution={tiles.attribution} />;
}
