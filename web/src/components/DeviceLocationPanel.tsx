import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import type { User } from "oidc-client-ts";
import { fetchReverseGeocode } from "../api/client";
import { DeviceMap } from "./DeviceMap";
import { useClientConfig } from "../config/clientConfig";

interface DeviceLocationPanelProps {
  uid: string;
  lat: number;
  lon: number;
  accuracyM: number | null;
  label: string;
  user: User;
}

export function DeviceLocationPanel({
  uid,
  lat,
  lon,
  accuracyM,
  label,
  user,
}: DeviceLocationPanelProps) {
  const [address, setAddress] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(true);
  const [addressError, setAddressError] = useState(false);
  const { config } = useClientConfig();
  // Until settings load, assume lookup is on; the server answers 404 if it is off.
  const geocoderEnabled = config?.geocoderEnabled ?? true;

  useEffect(() => {
    if (!geocoderEnabled) {
      setAddressLoading(false);
      return;
    }
    let cancelled = false;
    setAddressLoading(true);
    setAddressError(false);
    setAddress(null);

    fetchReverseGeocode(user, lat, lon)
      .then((result) => {
        if (!cancelled) {
          setAddress(result.address);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAddressError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAddressLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user, lat, lon, geocoderEnabled]);

  return (
    <>
      <dl className="info-list location-info">
        <div>
          <dt>Address</dt>
          <dd>
            {!geocoderEnabled
              ? "Address lookup is turned off"
              : addressLoading
              ? "Looking up address…"
              : addressError
                ? "Address unavailable"
                : address}
          </dd>
        </div>
        <div>
          <dt>Coordinates</dt>
          <dd>
            {lat.toFixed(5)}, {lon.toFixed(5)}
          </dd>
        </div>
        <div>
          <dt>GPS accuracy</dt>
          <dd>
            {accuracyM != null
              ? `±${Math.round(accuracyM)} m`
              : "Not reported by device"}
          </dd>
        </div>
      </dl>
      <DeviceMap lat={lat} lon={lon} label={label} />
      <p className="location-history-link">
        <Link to={`/devices/${uid}/location-history`}>Location history</Link>
      </p>
    </>
  );
}
