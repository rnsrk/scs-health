"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

import type { StatusResponse } from "@/lib/checks";

const REFRESH_MS = 30_000;

function badge(status: "up" | "down" | "degraded" | "healthy" | "unhealthy" | "starting" | "none") {
  const colors: Record<string, string> = {
    up: "var(--ok)",
    healthy: "var(--ok)",
    degraded: "var(--warn)",
    starting: "var(--warn)",
    down: "var(--bad)",
    unhealthy: "var(--bad)",
    none: "var(--muted)",
  };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: `${colors[status]}22`,
        color: colors[status],
        border: `1px solid ${colors[status]}55`,
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

export default function HomePage() {
  const { data: session } = useSession();
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/status", { cache: "no-store" });
      const json = (await response.json()) as StatusResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const overall = data?.summary.overall ?? "unhealthy";

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px 48px" }}>
      <header style={{ marginBottom: 28 }}>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>SODa SCS Stack</p>
        <h1 style={{ margin: "6px 0 10px", fontSize: 32 }}>Health Dashboard</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {badge(overall)}
          {data && (
            <span style={{ color: "var(--muted)", fontSize: 14 }}>
              Last check: {new Date(data.checkedAt).toLocaleString()}
            </span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {session?.user?.name && (
              <span style={{ color: "var(--muted)", fontSize: 14 }}>{session.user.name}</span>
            )}
            <button
              type="button"
              onClick={() => void load()}
              style={{
                background: "var(--panel)",
                color: "var(--text)",
                border: `1px solid var(--border)`,
                borderRadius: 8,
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: "/login" })}
              style={{
                background: "var(--panel)",
                color: "var(--text)",
                border: `1px solid var(--border)`,
                borderRadius: 8,
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {loading && !data && <p>Loading status…</p>}
      {error && <p style={{ color: "var(--bad)" }}>{error}</p>}

      {data && (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 28,
            }}
          >
            {[
              ["Websites up", `${data.summary.websitesUp}/${data.summary.websitesTotal}`],
              ["Containers up", `${data.summary.containersUp}/${data.summary.containersTotal}`],
              ["Overall", data.summary.overall],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  background: "var(--panel)",
                  border: `1px solid var(--border)`,
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div style={{ color: "var(--muted)", fontSize: 13 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{value}</div>
              </div>
            ))}
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12 }}>Websites</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {data.websites.map((site) => (
                <article
                  key={site.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                    alignItems: "center",
                    background: "var(--panel)",
                    border: `1px solid var(--border)`,
                    borderRadius: 12,
                    padding: "14px 16px",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{site.name}</div>
                    <a href={site.url} style={{ fontSize: 13, wordBreak: "break-all" }}>
                      {site.url}
                    </a>
                    {site.message && (
                      <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                        {site.message}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {badge(site.status)}
                    <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
                      {site.httpStatus ? `HTTP ${site.httpStatus}` : "—"} · {site.latencyMs} ms
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {data.containers.length > 0 && (
            <section>
              <h2 style={{ fontSize: 20, marginBottom: 12 }}>Docker containers</h2>
              <div
                style={{
                  background: "var(--panel)",
                  border: `1px solid var(--border)`,
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                      <th style={{ padding: "12px 14px" }}>Name</th>
                      <th style={{ padding: "12px 14px" }}>State</th>
                      <th style={{ padding: "12px 14px" }}>Health</th>
                      <th style={{ padding: "12px 14px" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.containers.map((c) => (
                      <tr key={c.name} style={{ borderTop: `1px solid var(--border)` }}>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>{c.name}</td>
                        <td style={{ padding: "10px 14px" }}>{c.state}</td>
                        <td style={{ padding: "10px 14px" }}>{badge(c.health)}</td>
                        <td style={{ padding: "10px 14px", color: "var(--muted)" }}>{c.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
