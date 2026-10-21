/** Minimal OCI distribution client: anonymous token auth, tag lists, manifest digests. */

const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

export const DOCKER_HUB = "registry-1.docker.io";

const MAX_TAG_PAGES = 30;
const TIMEOUT_MS = 15_000;

export type ImageRef = {
  /** Registry host used for API calls (Docker Hub → registry-1.docker.io). */
  registry: string;
  /** Repository path, e.g. library/nginx. */
  repository: string;
  tag: string;
  /** Short name for display, e.g. nginx or ghcr.io/org/app. */
  display: string;
};

/** Parse an image reference like nginx:1.30-alpine or ghcr.io/org/app:1.2. */
export function parseImageRef(ref: string): ImageRef | null {
  const withoutDigest = ref.split("@")[0];
  if (!withoutDigest || /^[0-9a-f]{12,64}$/.test(withoutDigest)) return null;

  const lastSlash = withoutDigest.lastIndexOf("/");
  const lastColon = withoutDigest.lastIndexOf(":");
  const hasTag = lastColon > lastSlash;
  const name = hasTag ? withoutDigest.slice(0, lastColon) : withoutDigest;
  const tag = hasTag ? withoutDigest.slice(lastColon + 1) : "latest";

  const parts = name.split("/");
  const first = parts[0];
  const isRegistry =
    parts.length > 1 && (first.includes(".") || first.includes(":") || first === "localhost");

  if (isRegistry) {
    return { registry: first, repository: parts.slice(1).join("/"), tag, display: name };
  }
  const repository = parts.length === 1 ? `library/${name}` : name;
  return { registry: DOCKER_HUB, repository, tag, display: name };
}

const tokenCache = new Map<string, { token: string; expires: number }>();

function parseChallenge(header: string | null): Record<string, string> | null {
  if (!header || !/^Bearer\s/i.test(header)) return null;
  const params: Record<string, string> = {};
  for (const match of header.matchAll(/(\w+)="([^"]*)"/g)) {
    params[match[1]] = match[2];
  }
  return params.realm ? params : null;
}

async function fetchToken(challenge: Record<string, string>, scope: string): Promise<string | null> {
  const key = `${challenge.realm}|${challenge.service ?? ""}|${scope}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.token;

  const url = new URL(challenge.realm);
  if (challenge.service) url.searchParams.set("service", challenge.service);
  url.searchParams.set("scope", scope);

  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) return null;
  const json = (await response.json()) as { token?: string; access_token?: string; expires_in?: number };
  const token = json.token ?? json.access_token;
  if (!token) return null;

  const ttlSeconds = Math.max(30, (json.expires_in ?? 300) - 30);
  tokenCache.set(key, { token, expires: Date.now() + ttlSeconds * 1000 });
  return token;
}

/** Request against the registry; retries once with an anonymous bearer token on 401. */
async function registryFetch(ref: ImageRef, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("User-Agent", "scs-health/0.1");

  const send = () => fetch(url, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  let response = await send();
  if (response.status !== 401) return response;

  const challenge = parseChallenge(response.headers.get("www-authenticate"));
  if (!challenge) return response;
  const token = await fetchToken(challenge, `repository:${ref.repository}:pull`);
  if (!token) return response;

  headers.set("Authorization", `Bearer ${token}`);
  response = await send();
  return response;
}

function nextLink(header: string | null, base: string): string | null {
  const match = header?.match(/<([^>]+)>;\s*rel="next"/);
  return match ? new URL(match[1], base).toString() : null;
}

export async function listTags(ref: ImageRef): Promise<string[]> {
  const base = `https://${ref.registry}`;
  let url: string | null = `${base}/v2/${ref.repository}/tags/list?n=1000`;
  const tags: string[] = [];

  for (let page = 0; url && page < MAX_TAG_PAGES; page++) {
    const response = await registryFetch(ref, url);
    if (!response.ok) throw new Error(`tags/list HTTP ${response.status}`);
    const json = (await response.json()) as { tags?: string[] | null };
    tags.push(...(json.tags ?? []));
    url = nextLink(response.headers.get("link"), base);
  }
  return tags;
}

/** Digest of the manifest (or index) a tag currently points to; null if the tag is not published. */
export async function manifestDigest(ref: ImageRef, tag = ref.tag): Promise<string | null> {
  const url = `https://${ref.registry}/v2/${ref.repository}/manifests/${encodeURIComponent(tag)}`;
  const response = await registryFetch(ref, url, {
    method: "HEAD",
    headers: { Accept: MANIFEST_ACCEPT },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
  return response.headers.get("docker-content-digest");
}
