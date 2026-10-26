import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "react-oidc-context";
import { fetchClientConfig } from "../api/client";
import type { ClientConfig } from "../types";

interface ClientConfigState {
  /** null until loaded (or when loading failed). */
  config: ClientConfig | null;
  error: string | null;
}

const ClientConfigContext = createContext<ClientConfigState>({ config: null, error: null });

/** Loads the server's runtime settings once per signed-in user and shares them with every page. */
export function ClientConfigProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [state, setState] = useState<ClientConfigState>({ config: null, error: null });
  const userId = auth.user?.profile.sub;

  useEffect(() => {
    if (!auth.user || !userId) return;
    let cancelled = false;
    fetchClientConfig(auth.user)
      .then((config) => {
        if (!cancelled) setState({ config, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ config: null, error: err instanceof Error ? err.message : "Failed to load settings" });
        }
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch only when the signed-in user changes, not on every silent token renewal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return <ClientConfigContext.Provider value={state}>{children}</ClientConfigContext.Provider>;
}

export function useClientConfig(): ClientConfigState {
  return useContext(ClientConfigContext);
}
