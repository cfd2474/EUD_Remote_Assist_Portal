import { MapContainer, Marker, Popup } from "react-leaflet";
import { BaseTileLayer, markerIcon } from "./BaseTileLayer";

interface DeviceMapProps {
  lat: number;
  lon: number;
  label: string;
}

export function DeviceMap({ lat, lon, label }: DeviceMapProps) {
  return (
    <div className="device-map">
      <MapContainer center={[lat, lon]} zoom={14} scrollWheelZoom={false}>
        <BaseTileLayer />
        <Marker position={[lat, lon]} icon={markerIcon}>
          <Popup>{label}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
