export type CheckResult = {
  id: string;
  name: string;
  url: string;
  status: "up" | "down" | "degraded";
  httpStatus?: number;
  latencyMs: number;
  message?: string;
};

export type ContainerResult = {
  name: string;
  state: string;
  status: string;
  health: "healthy" | "unhealthy" | "starting" | "none";
  ok: boolean;
};

export type StatusResponse = {
  checkedAt: string;
  summary: {
    websitesUp: number;
    websitesTotal: number;
    containersUp: number;
    containersTotal: number;
    overall: "healthy" | "degraded" | "unhealthy";
  };
  websites: CheckResult[];
  containers: ContainerResult[];
};

export type ServiceDefinition = {
  id: string;
  name: string;
  domain?: string;
  path?: string;
  /** HTTP statuses treated as healthy (default: 200–399). */
  okStatuses?: number[];
};

function domainUrl(domain: string | undefined, path = "/"): string | null {
  const trimmed = domain?.trim();
  if (!trimmed) return null;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `https://${trimmed}${normalizedPath}`;
}

/** Build website checks from deployment env vars (set via docker-compose). */
export function getServiceDefinitions(): ServiceDefinition[] {
  return [
    { id: "manager", name: "SCS Manager", domain: process.env.SCS_MANAGER_DOMAIN, path: "/health" },
    { id: "keycloak", name: "Keycloak", domain: process.env.KC_DOMAIN },
    { id: "nextcloud", name: "Nextcloud", domain: process.env.NEXTCLOUD_NEXTCLOUD_DOMAIN },
    { id: "onlyoffice", name: "OnlyOffice", domain: process.env.NEXTCLOUD_ONLYOFFICE_DOMAIN },
    { id: "jupyterhub", name: "JupyterHub", domain: process.env.JUPYTERHUB_DOMAIN },
    { id: "open-gdb", name: "Open GDB", domain: process.env.OPEN_GDB_DOMAIN },
    { id: "project-website", name: "Project Website", domain: process.env.PROJECT_WEBSITE_DOMAIN },
    { id: "webprotege", name: "WebProtégé", domain: process.env.WEBPROTEGE_WEBPROTEGE_DOMAIN },
    { id: "dbms", name: "phpMyAdmin", domain: process.env.SCS_DBMS_DOMAIN, okStatuses: [200, 301, 302, 303, 307, 308, 401, 403] },
    { id: "portainer", name: "Portainer", domain: process.env.SCS_PORTAINER_DOMAIN },
    { id: "traefik", name: "Traefik Dashboard", domain: process.env.SCS_TRAEFIK_DOMAIN, okStatuses: [200, 401, 403] },
    {
      id: "scs-redirect",
      name: "SCS Root Redirect",
      domain: process.env.SCS_MANAGER_SECOND_DOMAIN,
      okStatuses: [301, 302, 307, 308],
    },
  ];
}

function isOkStatus(status: number, okStatuses?: number[]): boolean {
  if (okStatuses?.length) return okStatuses.includes(status);
  return status >= 200 && status < 400;
}

export async function checkWebsite(def: ServiceDefinition): Promise<CheckResult> {
  const url = domainUrl(def.domain, def.path);
  if (!url) {
    return {
      id: def.id,
      name: def.name,
      url: "(not configured)",
      status: "down",
      latencyMs: 0,
      message: "Domain env var not set",
    };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "scs-health/0.1" },
    });

    const latencyMs = Date.now() - started;
    const ok = isOkStatus(response.status, def.okStatuses);

    return {
      id: def.id,
      name: def.name,
      url,
      status: ok ? "up" : "degraded",
      httpStatus: response.status,
      latencyMs,
      message: ok ? undefined : `Unexpected HTTP ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return {
      id: def.id,
      name: def.name,
      url,
      status: "down",
      latencyMs: Date.now() - started,
      message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkAllWebsites(): Promise<CheckResult[]> {
  const defs = getServiceDefinitions();
  return Promise.all(defs.map((def) => checkWebsite(def)));
}
