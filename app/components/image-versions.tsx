"use client";

import { useCallback, useEffect, useState } from "react";

import type { ImageVersionResult, VersionsResponse } from "@/lib/images";
import type { UpdateLevel } from "@/lib/tags";

/** Registry answers are cached server-side; polling only picks up local pulls/recreates. */
const REFRESH_MS = 15 * 60_000;
const MAX_CONTAINER_NAMES = 3;

function levelClass(level: UpdateLevel | undefined): string {
  if (level === "major") return "scs-badge scs-badge--bad";
  if (level === "minor" || level === "date") return "scs-badge scs-badge--warn";
  return "scs-badge scs-badge--none";
}

function Updates({ image }: { image: ImageVersionResult }) {
  if (image.status === "unknown") {
    return <span className="scs-list-item-sub">{image.message ?? "Not checked"}</span>;
  }
  if (image.status === "current") {
    return (
      <div className="scs-version-updates">
        <span className="scs-badge scs-badge--ok">up to date</span>
        {image.message && <span className="scs-list-item-sub">{image.message}</span>}
      </div>
    );
  }

  return (
    <div className="scs-version-updates">
      {image.newerTag && (
        <span>
          <span className="mono">{image.newerTag}</span> <span className={levelClass(image.newerLevel)}>{image.newerLevel}</span>
        </span>
      )}
      {image.newerTagSameMajor && (
        <span>
          <span className="mono">{image.newerTagSameMajor}</span>{" "}
          <span className={levelClass(image.newerSameMajorLevel)}>{image.newerSameMajorLevel}</span>
        </span>
      )}
      {image.imageUpdate && (
        <span className="scs-badge scs-badge--warn" title="The registry has a newer build under the same tag">
          new build
        </span>
      )}
      {image.recreatePending && (
        <span className="scs-badge scs-badge--warn" title="Newer image pulled locally; containers still run the old one">
          recreate pending
        </span>
      )}
      {image.message && <span className="scs-list-item-sub">{image.message}</span>}
    </div>
  );
}

function Containers({ names }: { names: string[] }) {
  const shown = names.slice(0, MAX_CONTAINER_NAMES);
  const rest = names.length - shown.length;
  return (
    <span className="scs-list-item-sub" title={names.join("\n")}>
      {shown.join(", ")}
      {rest > 0 && ` +${rest} more`}
    </span>
  );
}

export function ImageVersions({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<VersionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const response = await fetch("/api/versions", { cache: "no-store" });
      const json = (await response.json()) as VersionsResponse & { error?: string };
      if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load image versions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load, refreshKey]);

  const updates = data?.images.filter((image) => image.status === "update").length ?? 0;

  return (
    <section style={{ marginTop: "2rem" }}>
      <h2 className="scs-section-title">Images</h2>
      {loading && !data && <p>Checking registries…</p>}
      {error && <p className="scs-error">{error}</p>}
      {data && (
        <>
          <p className="scs-list-item-sub" style={{ marginBottom: "0.75rem" }}>
            {updates} of {data.images.length} images have updates · checked{" "}
            {new Date(data.checkedAt).toLocaleString()}
          </p>
          <div className="scs-table-wrap">
            <table className="scs-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>In use</th>
                  <th>Available</th>
                  <th>Containers</th>
                </tr>
              </thead>
              <tbody>
                {data.images.map((image) => (
                  <tr key={`${image.source}|${image.ref}`}>
                    <td className="mono">
                      {image.name}
                      {image.source === "build" && <div className="scs-list-item-sub">base of local build</div>}
                    </td>
                    <td className="mono">{image.tag}</td>
                    <td>
                      <Updates image={image} />
                    </td>
                    <td>
                      <Containers names={image.containers} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
