# EUD Remote Assist Portal

**Release:** 3.4.0 (see [`VERSION`](VERSION) and [docs/versioning.md](docs/versioning.md))

Server-based web platform for remotely managing company-owned Android devices. Supports device registration, location tracking, ping requests, WebSocket command delivery, and WebRTC screen viewing with remote touch control. Includes **Constrained Network Detection** for bandwidth-limited links such as satellite, and a configurable **TURN server** for WebRTC relay that both the admin browser and the device use. External services (STUN, map tiles, address lookup, PhoneDB model names) are configurable or can be turned off for closed networks. See the *External services* block in [`.env.example`](.env.example).

Protected by **OIDC (Authentik)** for admins. Device APIs authenticate via per-device `connection_secret`.

## Architecture

```
┌─────────────┐     HTTPS/OIDC      ┌──────────────┐
│ Admin Browser│ ──────────────────►│  nginx       │
└─────────────┘                      │  (reverse    │
                                     │   proxy)     │
┌─────────────┐     HTTPS/REST/WS    └──────┬───────┘
│ Android App │ ◄───────────────────────────┤
└─────────────┘                             │
                              ┌─────────────┴─────────────┐
                              │  API Server (Node.js)     │
                              │  - REST /api/v1 (devices) │
                              │  - REST /api/admin (OIDC) │
                              │  - WS /ws/device|admin    │
                              └─────────────┬─────────────┘
                                            │
                              ┌─────────────▼─────────────┐
                              │  PostgreSQL               │
                              └───────────────────────────┘
```

## Quick start (Docker)

```bash
cp .env.example .env
# Edit .env with your Authentik issuer, passwords, and public URL

docker compose up -d --build
```

Portal: `http://localhost` (or your configured host)

## API endpoints (Android client)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/register` | None | One-time device registration |
| GET/POST | `/api/v1/ping` | None | Verify device UID is registered (heartbeat) |
| POST | `/api/v1/telemetry` | `X-Connection-Secret` | Location/battery pulse |
| POST | `/api/v1/event` | `X-Connection-Secret` | e.g. `PING_ACKNOWLEDGED` |
| WS | `/ws/device` | First message auth | Receive commands, WebRTC signaling |

### Commands (server → device via WebSocket)

- `TRIGGER_PING`
- `REQUEST_LOCATION`
- `START_REMOTE_ADMIN`
- `STOP_REMOTE_ADMIN`

### Remote control (admin → device)

```json
{ "action": "CLICK", "x_percent": 0.45, "y_percent": 0.22 }
```

## Admin portal

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/devices` | Bearer JWT | List devices |
| GET | `/api/admin/devices/:uid` | Bearer JWT | Device detail |
| DELETE | `/api/admin/devices/:uid` | Bearer JWT | Remove device and all data |
| POST | `/api/admin/devices/:uid/command` | Bearer JWT | Send command |
| POST | `/api/admin/devices/:uid/control` | Bearer JWT | Send touch packet |
| WS | `/ws/admin` | OIDC token in auth | WebRTC signaling relay |

## Deployment

**GitHub stores the code; you install manually on your server.**

1. Push or pull from this repository as needed.
2. On your Ubuntu 22.04 server, clone the repo and run Docker Compose.

### Azure Deployment Requirements

If you are deploying the portal on Microsoft Azure, Azure's Network Security Group (NSG) and default symmetric NAT require explicit port openings to allow WebRTC and signaling traffic to function correctly. You must configure the inbound port rules on your VM's NSG as follows:

#### 1. Web Portal & Signaling
The stack itself publishes only `HTTP_PORT` (plain HTTP, ideally on loopback). Your TLS reverse proxy (host nginx or Caddy) serves the public ports:
*   **Port 443 (TCP):** Required. Admin portal.
*   **Port 8448 (TCP):** Required. Device API and device WebSocket. This is the port in `PUBLIC_BASE_URL` and in enrollment QR codes.
*   **Port 80 (TCP):** Only if your proxy needs it for Let's Encrypt HTTP challenges.

#### 2. WebRTC Media Relay / TURN Server
Azure deployments typically need a TURN server (e.g. CoTURN) to relay video, because direct UDP hole punching often fails across Azure's NAT.
*   **TURN listening port (UDP & TCP):** whatever port your TURN server listens on. 3478 is the standard; infra-TAK uses **3479**. Set the full URL (for example `turn:203.0.113.10:3479`) as `TURN_URL` in `.env`, or under Portal Configuration → TURN.
*   **Port 5349 (TCP):** Only if you configure TURN over TLS (`turns:`).
*   **Relay port range (UDP):** must match your TURN server's `min-port`/`max-port` (infra-TAK: 50000–50050; CoTURN's default: 49152–65535). Media relays over **UDP**, so open this range for UDP. If it's blocked, remote view hangs at "Connecting".

Full steps: [docs/manual-install.md](docs/manual-install.md)  
infra-TAK co-deploy: [docs/infratak-integration.md](docs/infratak-integration.md)

```bash
git clone https://github.com/cfd2474/EUD_Remote_Assist_Portal.git /opt/eud-remote-assist
cd /opt/eud-remote-assist
cp .env.example .env   # edit with your values
docker compose up -d --build
```

To update after new code is pushed:

```bash
cd /opt/eud-remote-assist && git pull && docker compose up -d --build
```

## Configuration

See:

- [docs/eud-remote-assist-portal-admin-guide.md](docs/eud-remote-assist-portal-admin-guide.md) — **administrator user guide**
- [docs/eud-remote-assist-app-deployment-guide.md](docs/eud-remote-assist-app-deployment-guide.md) — **Android app deployment & MDM guide**
- [docs/infratak-integration.md](docs/infratak-integration.md) — infra-TAK loopback/Caddy profile (no compose patching)
- [docs/versioning.md](docs/versioning.md) — release version checks for install automation
- [docs/manual-install.md](docs/manual-install.md) — server setup on Ubuntu 22.04
- [docs/authentik-setup.md](docs/authentik-setup.md) — OIDC provider setup
- [docs/mdm-config.md](docs/mdm-config.md) — Android MDM managed config
- [docs/app-hosting.md](docs/app-hosting.md) — the console hosts the app APK (no GitHub at runtime)

## Local development

```bash
# Terminal 1 — database
# (matches DATABASE_URL in server/.env.example)
docker run -d --name eud-pg -e POSTGRES_PASSWORD=cfd_secret -e POSTGRES_DB=eud_remote_assist -e POSTGRES_USER=cfd -p 5432:5432 postgres:16-alpine

# Terminal 2 — API
cd server && cp .env.example .env && npm install && npm run db:migrate && npm run dev

# Terminal 3 — Web
cd web && cp .env.example .env && npm install && npm run dev
```

### Tests

```bash
cd server && npm run typecheck && npm test   # DB tests are skipped without TEST_DATABASE_URL
cd web && npm test
```

The enrollment tests need a disposable Postgres. They truncate tables, so the database name must contain `test`:

```bash
docker run -d --rm --name eud-test-pg -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=eud_test -p 127.0.0.1:55433:5432 postgres:16-alpine
cd server && TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55433/eud_test npm test
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs all of this on every push to `dev` and `main`. A release must have a `vX.Y.Z` tag equal to `VERSION`. Push both together with `git push --atomic origin dev vX.Y.Z`.

## Project structure

```
server/          Node.js API + WebSocket hub
web/             React admin portal (Vite)
nginx/           Reverse proxy config + TLS certs
docs/            Install, Authentik & MDM guides
docker-compose.yml
```
