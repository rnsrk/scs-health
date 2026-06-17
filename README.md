# SCS Health

A lightweight **health dashboard** for the [SODa SCS Manager](https://github.com/soda-collections-objects-data-literacy/soda_scs_manager_deployment) stack. It shows whether public-facing services respond over HTTPS and whether Docker containers on the host are running.

Built with **Next.js 15** and **NextAuth.js**. The dashboard is protected behind login; unauthenticated users only reach `/login` and the public liveness probe at `/api/health`.

## What it checks

### Websites

HTTP GET requests against domains from deployment environment variables (via `docker-compose.yml`):

| Service | Env var | Notes |
| --- | --- | --- |
| SCS Manager | `SCS_MANAGER_DOMAIN` | `/health` |
| Keycloak | `KC_DOMAIN` | |
| Nextcloud | `NEXTCLOUD_NEXTCLOUD_DOMAIN` | |
| OnlyOffice | `NEXTCLOUD_ONLYOFFICE_DOMAIN` | |
| JupyterHub | `JUPYTERHUB_DOMAIN` | |
| Open GDB | `OPEN_GDB_DOMAIN` | |
| Project Website | `PROJECT_WEBSITE_DOMAIN` | |
| WebProtégé | `WEBPROTEGE_WEBPROTEGE_DOMAIN` | |
| phpMyAdmin | `SCS_DBMS_DOMAIN` | 401/403 treated as up |
| Portainer | `SCS_PORTAINER_DOMAIN` | |
| Traefik Dashboard | `SCS_TRAEFIK_DOMAIN` | 401/403 treated as up |
| SCS Root Redirect | `SCS_MANAGER_SECOND_DOMAIN` | redirect codes treated as up |

Unset domain variables appear as **down** with message “Domain env var not set”.

### Docker containers

When the Docker socket is mounted (default in deployment), the app runs `docker ps` and lists container state and health. Set `SCS_HEALTH_DOCKER_ENABLED=false` to disable this section.

The status API auto-refreshes every 30 seconds in the UI.

## Authentication

Two login methods can be active at the same time:

1. **Local credentials** — username/password from env vars (always available when configured).
2. **Keycloak SSO** — optional OIDC via NextAuth’s Keycloak provider; shown on the login page when OIDC env vars are set.

Protected routes use NextAuth middleware. `/api/health` stays public for container health checks.

---

## Installation

### As part of the SODa deployment (recommended)

`scs-health` is a **git submodule** of the main deployment repository.

```bash
# From the deployment repo root
git submodule update --init scs-health

# Ensure scs-health is in COMPOSE_FILE (see example-env in the parent repo)
# Copy override into place (start.sh does this automatically):
cp 00_custom_configs/scs-health/docker/docker-compose.override.yml \
   scs-health/docker-compose.override.yml

# Set variables in the root .env (see Configuration below), then:
docker compose up -d --build scs--health
```

The container is exposed through Traefik at `https://${SCS_HEALTH_DOMAIN}` (default: `health.${SCS_SUBDOMAIN}.${SCS_BASE_DOMAIN}`).

### Standalone development

```bash
cd scs-health
npm ci
npm run dev
```

Open `http://localhost:3000`. For local auth you need at least:

```bash
export NEXTAUTH_URL=http://localhost:3000
export SCS_HEALTH_AUTH_SECRET="$(openssl rand -base64 32)"
export SCS_HEALTH_AUTH_USER=admin
export SCS_HEALTH_AUTH_PASSWORD=your-password
```

Website checks need the same `*_DOMAIN` variables as in production. Docker container listing requires a local Docker socket and the `docker` CLI on your PATH.

### Production image

```bash
docker build -t scs-health .
docker run --rm -p 3000:3000 \
  -e NEXTAUTH_URL=https://health.example.com \
  -e SCS_HEALTH_AUTH_SECRET=... \
  -e SCS_HEALTH_AUTH_USER=admin \
  -e SCS_HEALTH_AUTH_PASSWORD=... \
  scs-health
```

---

## Configuration

Set these in the **deployment root** `.env` (inherited by `scs--health` via `docker-compose.yml`):

| Variable | Required | Description |
| --- | --- | --- |
| `SCS_HEALTH_DOMAIN` | Yes | Public hostname (Traefik + `NEXTAUTH_URL`) |
| `SCS_HEALTH_AUTH_SECRET` | Yes | NextAuth session signing secret (`openssl rand -base64 32`) |
| `SCS_HEALTH_AUTH_USER` | For local login | Defaults to `SCS_TRAEFIK_USERNAME` |
| `SCS_HEALTH_AUTH_PASSWORD` | For local login | Defaults to `SCS_TRAEFIK_PASSWORD` |
| `SCS_HEALTH_OIDC_CLIENT_ID` | For SSO | Keycloak client ID |
| `SCS_HEALTH_OIDC_CLIENT_SECRET` | For SSO | Keycloak client secret |
| `SCS_HEALTH_OIDC_ISSUER` | For SSO | OIDC issuer URL (see below) |
| `SCS_HEALTH_DOCKER_ENABLED` | No | Set to `false` to skip Docker container checks |

`KC_URL` and `KC_REALM` are already passed into the container. If `SCS_HEALTH_OIDC_ISSUER` is unset, the issuer is derived as:

```text
${KC_URL}/realms/${KC_REALM}
```

Service domain variables (`SCS_MANAGER_DOMAIN`, `KC_DOMAIN`, etc.) come from the main deployment `.env`.

After changing env vars:

```bash
docker compose up -d --force-recreate scs--health
```

---

## SSO setup (Keycloak)

There is **no pre-defined Keycloak client** in the realm template yet. Create one manually in the Keycloak admin console.

### 1. Create an OpenID Connect client

In your SCS realm (e.g. **Clients → Create client**):

| Setting | Value |
| --- | --- |
| Client type | OpenID Connect |
| Client ID | e.g. `https://health.scs.example.com` (any unique string; other SCS clients use the service URL as ID) |
| Client authentication | On (confidential) |
| Standard flow | Enabled |
| Direct access grants | Off (recommended) |

### 2. Redirect URIs and web origins

Add the NextAuth callback URL for your health dashboard host:

```text
https://${SCS_HEALTH_DOMAIN}/api/auth/callback/keycloak
```

Example:

```text
https://health.scs.sammlungen.io/api/auth/callback/keycloak
```

Set **Valid redirect URIs** to that URL (or `https://health.scs.sammlungen.io/*` during setup).

Set **Web origins** to:

```text
https://${SCS_HEALTH_DOMAIN}
```

### 3. Copy the client secret

On the client **Credentials** tab, copy the secret into the deployment `.env`:

```bash
SCS_HEALTH_OIDC_CLIENT_ID=https://health.scs.sammlungen.io
SCS_HEALTH_OIDC_CLIENT_SECRET=<secret-from-keycloak>
SCS_HEALTH_OIDC_ISSUER=https://auth.scs.sammlungen.io/realms/scs
```

If `KC_URL` and `KC_REALM` are already set correctly, you can omit `SCS_HEALTH_OIDC_ISSUER` and let the app build the issuer automatically.

### 4. Recreate the container

```bash
docker compose up -d --force-recreate scs--health
```

The login page shows **Sign in with Keycloak** when all three OIDC variables are non-empty. Local username/password login remains available.

### 5. Access control (optional)

By default, any user who can log in to the Keycloak realm can open the dashboard. To restrict access:

- Create a Keycloak group (e.g. `scs-health-admins`) and assign only operators who should see the dashboard.
- Add a **Client role** or enable **Authorization** on the client and map realm roles/groups as needed.

NextAuth currently accepts any successful Keycloak login; fine-grained authorization can be added in `lib/auth.ts` if required.

---

## API endpoints

| Path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | Liveness probe (used by Docker healthcheck) |
| `GET /api/status` | Session required | Full status JSON (200 / 207 / 503 by overall health) |
| `GET /api/auth/*` | NextAuth | Login, callback, session |

---

## Project layout

```text
app/           Next.js App Router pages and API routes
lib/
  auth.ts      NextAuth providers (credentials + Keycloak)
  checks.ts    Website health checks
  docker.ts    Docker container listing
middleware.ts  Route protection
docker-compose.yml   Base service definition (submodule)
Dockerfile     Multi-stage production build (standalone output)
```

---

## Related documentation

When deployed via the SODa stack, see the parent repo:

- [SCS Health (deployment guide)](../docs/service-infrastructure/scs-health.md)
- [Service infrastructure overview](../docs/service-infrastructure/index.md)
