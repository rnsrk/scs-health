import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { DOCKER_HUB, listTags, manifestDigest, parseImageRef, type ImageRef } from "./registry";
import { compareTags, type UpdateLevel } from "./tags";

const execFileAsync = promisify(execFile);

const CACHE_MS = Number(process.env.SCS_HEALTH_VERSION_CACHE_MINUTES ?? 360) * 60_000;
const ERROR_CACHE_MS = 15 * 60_000;
const CONCURRENCY = 4;

export type ImageVersionResult = {
  /** Image reference as configured, e.g. nginx:1.27-alpine. */
  ref: string;
  name: string;
  tag: string;
  /** "build": local Compose build, checked against its base image (when known). */
  source: "registry" | "build";
  containers: string[];
  status: "current" | "update" | "unknown";
  /** Newest tag of the same shape (same precision and variant). */
  newerTag?: string;
  newerLevel?: UpdateLevel;
  /** Newest tag within the current major, when the overall newest is a major jump. */
  newerTagSameMajor?: string;
  newerSameMajorLevel?: UpdateLevel;
  /** The registry has a newer build under the same tag (digest differs). */
  imageUpdate?: boolean;
  /** The tag was pulled again locally, but containers still run the old image. */
  recreatePending?: boolean;
  message?: string;
};

export type VersionsResponse = {
  checkedAt: string;
  images: ImageVersionResult[];
};

type ContainerInspect = {
  Id: string;
  Name: string;
  Image: string;
  Config: { Image: string; Labels?: Record<string, string> | null };
};

type ImageInspect = {
  Id: string;
  RepoTags?: string[] | null;
  RepoDigests?: string[] | null;
};

type Remote = { tags?: string[]; digest?: string | null; error?: string };

const remoteCache = new Map<string, { value: Promise<Remote>; expires: number }>();

/** `docker … inspect` exits non-zero when one id is missing but still prints the rest. */
async function dockerInspect<T>(args: string[]): Promise<T[]> {
  if (args.length === 0) return [];
  try {
    const { stdout } = await execFileAsync("docker", args, { maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(stdout) as T[];
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout;
    if (!stdout?.trim()) return [];
    return JSON.parse(stdout) as T[];
  }
}

/** Local builds: SCS_HEALTH_BUILD_BASES="service=base:tag,service=base:tag". */
function buildBases(): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of (process.env.SCS_HEALTH_BUILD_BASES ?? "").split(",")) {
    const [service, base] = entry.split("=").map((part) => part.trim());
    if (service && base) map.set(service, base);
  }
  return map;
}

/**
 * Compose builds are named {project}-{service}. Refs naming a registry host (ghcr.io/…)
 * are always checked there, even when built locally. Other builds were never pulled, so
 * neither the running image nor the one the tag points to has a registry digest. (A
 * dangling old pull loses its digests once the tag is pulled again, hence checking both.)
 */
function isLocalBuild(
  container: ContainerInspect,
  running: ImageInspect | undefined,
  tagged: ImageInspect | undefined,
): boolean {
  const labels = container.Config.Labels ?? {};
  const project = labels["com.docker.compose.project"];
  const service = labels["com.docker.compose.service"];
  if (project && service && container.Config.Image === `${project}-${service}`) return true;
  const ref = parseImageRef(container.Config.Image);
  if (ref && ref.registry !== DOCKER_HUB) return false;
  return !running?.RepoDigests?.length && !tagged?.RepoDigests?.length;
}

/** Local images by tag; Docker Hub refs without a tag are stored as …:latest. */
async function inspectTags(refs: string[]): Promise<Map<string, ImageInspect>> {
  const localImages = await dockerInspect<ImageInspect>(["image", "inspect", ...refs]);
  const images = new Map<string, ImageInspect>();
  for (const image of localImages) {
    for (const tag of image.RepoTags ?? []) images.set(tag, image);
  }
  for (const ref of refs) {
    if (!images.has(ref)) {
      const match = localImages.find((image) => image.RepoTags?.includes(`${ref}:latest`));
      if (match) images.set(ref, match);
    }
  }
  return images;
}

function fetchRemote(ref: ImageRef): Promise<Remote> {
  const key = `${ref.registry}/${ref.repository}:${ref.tag}`;
  const cached = remoteCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const value = (async (): Promise<Remote> => {
    try {
      const [tags, digest] = await Promise.all([listTags(ref), manifestDigest(ref)]);
      return { tags, digest };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Registry request failed" };
    }
  })();

  remoteCache.set(key, { value, expires: Date.now() + CACHE_MS });
  void value.then((remote) => {
    if (remote.error) remoteCache.set(key, { value, expires: Date.now() + ERROR_CACHE_MS });
  });
  return value;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

type Entry = {
  ref: string;
  source: ImageVersionResult["source"];
  containers: string[];
  /** Image ids the containers run (registry images only). */
  runningIds: Set<string>;
};

async function checkEntry(entry: Entry, images: Map<string, ImageInspect>): Promise<ImageVersionResult> {
  const parsed = parseImageRef(entry.ref);
  const base: ImageVersionResult = {
    ref: entry.ref,
    name: parsed?.display ?? entry.ref,
    tag: parsed?.tag ?? "",
    source: entry.source,
    containers: entry.containers.sort(),
    status: "unknown",
  };
  if (!parsed) return { ...base, message: "Not a registry image" };

  const local = images.get(entry.ref);
  if (entry.source === "registry" && local) {
    base.recreatePending = [...entry.runningIds].some((id) => id !== local.Id);
  }

  const remote = await fetchRemote(parsed);
  if (remote.error) return { ...base, message: remote.error };

  const comparison = compareTags(parsed.tag, remote.tags ?? []);
  if (comparison?.newest) {
    base.newerTag = comparison.newest;
    base.newerLevel = comparison.newestLevel;
  }
  if (comparison?.newestSameMajor) {
    base.newerTagSameMajor = comparison.newestSameMajor;
    base.newerSameMajorLevel = comparison.newestSameMajorLevel;
  }

  if (remote.digest === null) base.message = "Tag not published in the registry";

  // Local builds have no pulled copy of their base image to compare digests with.
  if (entry.source === "registry" && remote.digest) {
    const digests = (local?.RepoDigests ?? []).map((d) => d.split("@")[1]);
    base.imageUpdate = digests.length > 0 && !digests.includes(remote.digest);
  }

  const outdated = Boolean(base.newerTag || base.imageUpdate || base.recreatePending);
  return { ...base, status: outdated ? "update" : "current" };
}

export async function checkImageVersions(): Promise<VersionsResponse> {
  const checkedAt = new Date().toISOString();
  if (process.env.SCS_HEALTH_DOCKER_ENABLED === "false") return { checkedAt, images: [] };

  const { stdout } = await execFileAsync("docker", ["ps", "-aq"]);
  const ids = stdout.split("\n").map((id) => id.trim()).filter(Boolean);
  const containers = await dockerInspect<ContainerInspect>(["inspect", ...ids]);

  const runningIds = [...new Set(containers.map((container) => container.Image))];
  const running = new Map(
    (await dockerInspect<ImageInspect>(["image", "inspect", ...runningIds])).map((image) => [image.Id, image]),
  );
  const images = await inspectTags([...new Set(containers.map((container) => container.Config.Image))]);

  const bases = buildBases();
  const entries = new Map<string, Entry>();
  const add = (ref: string, source: Entry["source"], container: ContainerInspect) => {
    const key = `${source}|${ref}`;
    const entry = entries.get(key) ?? { ref, source, containers: [], runningIds: new Set<string>() };
    entry.containers.push(container.Name.replace(/^\//, ""));
    if (source === "registry") entry.runningIds.add(container.Image);
    entries.set(key, entry);
  };

  for (const container of containers) {
    if (!isLocalBuild(container, running.get(container.Image), images.get(container.Config.Image))) {
      add(container.Config.Image, "registry", container);
      continue;
    }
    const service = container.Config.Labels?.["com.docker.compose.service"] ?? "";
    const baseRef = bases.get(service);
    if (baseRef) add(baseRef, "build", container);
  }

  const results = await mapLimit([...entries.values()], CONCURRENCY, (entry) => checkEntry(entry, images));
  const order = { update: 0, unknown: 1, current: 2 } as const;
  results.sort((a, b) => order[a.status] - order[b.status] || a.ref.localeCompare(b.ref));
  return { checkedAt, images: results };
}
