/**
 * One ICE-server list for both WebRTC peers: the admin browser (RTCConfiguration.iceServers)
 * and the Android app (START_REMOTE_ADMIN.iceServers). See docs/PLATFORM_REFERENCE.md §6.
 *
 * `urls` is always an array: the app parses it with Gson getAsJsonArray("urls") and silently
 * falls back to its built-in STUN when it is a string. The app also *replaces* its built-in
 * STUN with whatever list it receives, so STUN must be included here, not only TURN.
 */

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface TurnServer {
  url: string;
  username?: string;
  credential?: string;
}

const STUN_URL = /^stuns?:[^\s?]+$/i;
const TURN_URL = /^turns?:[^\s]+$/i;

export function isValidStunUrl(url: string): boolean {
  return STUN_URL.test(url);
}

export function isValidTurnUrl(url: string): boolean {
  return TURN_URL.test(url);
}

/**
 * STUN entries first, then TURN. Invalid URLs are dropped (and reported through `onInvalid`)
 * rather than sent: a single bad entry would make the app discard the whole list.
 */
export function buildIceServers(
  stunUrls: string[],
  turn?: TurnServer,
  onInvalid: (url: string) => void = () => {}
): IceServer[] {
  const servers: IceServer[] = [];

  const stun = stunUrls.filter((url) => {
    const ok = isValidStunUrl(url);
    if (!ok) onInvalid(url);
    return ok;
  });
  if (stun.length > 0) {
    servers.push({ urls: stun });
  }

  if (turn?.url) {
    if (isValidTurnUrl(turn.url)) {
      const entry: IceServer = { urls: [turn.url] };
      if (turn.username) entry.username = turn.username;
      if (turn.credential) entry.credential = turn.credential;
      servers.push(entry);
    } else {
      onInvalid(turn.url);
    }
  }

  return servers;
}
