"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

import { ContainerIssuesModal } from "@/app/components/container-issues-modal";
import { MenuBarDivider } from "@/app/components/menu-bar-divider";
import { SodaFooter } from "@/app/components/soda-footer";
import type { StatusResponse } from "@/lib/checks";
import { getContainersWithIssues } from "@/lib/containers";

const REFRESH_MS = 30_000;

type BadgeStatus =
  | "up"
  | "down"
  | "degraded"
  | "healthy"
  | "unhealthy"
  | "starting"
  | "none";

function badgeClass(status: BadgeStatus): string {
  const map: Record<BadgeStatus, string> = {
    up: "scs-badge--up",
    healthy: "scs-badge--healthy",
    degraded: "scs-badge--degraded",
    starting: "scs-badge--starting",
    down: "scs-badge--down",
    unhealthy: "scs-badge--unhealthy",
    none: "scs-badge--none",
  };
  return `scs-badge ${map[status]}`;
}

function Badge({ status }: { status: BadgeStatus }) {
  return <span className={badgeClass(status)}>{status}</span>;
}

export default function HomePage() {
  const { data: session } = useSession();
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerModalOpen, setContainerModalOpen] = useState(false);

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
  const issueContainers = data ? getContainersWithIssues(data.containers) : [];
  const hasContainerIssues = issueContainers.length > 0;

  return (
    <div className="scs-login-shell">
      <MenuBarDivider />
      <main className="scs-page">
        <header className="scs-page-header">
          <p className="scs-eyebrow">SODa SCS Stack</p>
          <h1>Health Dashboard</h1>
        </header>

        <div className="scs-toolbar">
          <Badge status={overall} />
          {data && (
            <span className="scs-list-item-sub">
              Last check: {new Date(data.checkedAt).toLocaleString()}
            </span>
          )}
          <div className="scs-toolbar-spacer" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {session?.user?.name && (
              <span className="scs-list-item-sub">{session.user.name}</span>
            )}
            <button type="button" onClick={() => void load()} className="scs-btn scs-btn-secondary">
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: "/login" })}
              className="scs-btn scs-btn-secondary"
            >
              Sign out
            </button>
          </div>
        </div>

        {loading && !data && <p>Loading status…</p>}
        {error && <p className="scs-error">{error}</p>}

        {data && (
          <>
            <section className="scs-card-grid">
              <div className="scs-card">
                <div className="scs-card-stat-label">Websites up</div>
                <div className="scs-card-stat-value">
                  {data.summary.websitesUp}/{data.summary.websitesTotal}
                </div>
              </div>

              {hasContainerIssues ? (
                <button
                  type="button"
                  className="scs-card scs-card--clickable"
                  onClick={() => setContainerModalOpen(true)}
                  aria-label={`${issueContainers.length} containers not fully up. Show details.`}
                >
                  <div className="scs-card-stat-label">Containers up</div>
                  <div className="scs-card-stat-value">
                    {data.summary.containersUp}/{data.summary.containersTotal}
                  </div>
                  <p className="scs-card-stat-hint">Click to view {issueContainers.length} not up</p>
                </button>
              ) : (
                <div className="scs-card">
                  <div className="scs-card-stat-label">Containers up</div>
                  <div className="scs-card-stat-value">
                    {data.summary.containersUp}/{data.summary.containersTotal}
                  </div>
                </div>
              )}

              <div className="scs-card">
                <div className="scs-card-stat-label">Overall</div>
                <div className="scs-card-stat-value">{data.summary.overall}</div>
              </div>
            </section>

            <ContainerIssuesModal
              open={containerModalOpen}
              containers={issueContainers}
              onClose={() => setContainerModalOpen(false)}
            />

            <section style={{ marginBottom: "2rem" }}>
              <h2 className="scs-section-title">Websites</h2>
              <div className="scs-list">
                {data.websites.map((site) => (
                  <article key={site.id} className="scs-card scs-list-item">
                    <div>
                      <div style={{ fontWeight: 600 }}>{site.name}</div>
                      <a href={site.url} style={{ fontSize: "0.8125rem", wordBreak: "break-all" }}>
                        {site.url}
                      </a>
                      {site.message && <div className="scs-list-item-sub">{site.message}</div>}
                    </div>
                    <div className="scs-list-item-meta">
                      <Badge status={site.status} />
                      <div className="scs-list-item-sub" style={{ marginTop: 6 }}>
                        {site.httpStatus ? `HTTP ${site.httpStatus}` : "—"} · {site.latencyMs} ms
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {data.containers.length > 0 && (
              <section>
                <h2 className="scs-section-title">Docker containers</h2>
                <div className="scs-table-wrap">
                  <table className="scs-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>State</th>
                        <th>Health</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.containers.map((c) => (
                        <tr key={c.name}>
                          <td className="mono">{c.name}</td>
                          <td>{c.state}</td>
                          <td>
                            <Badge status={c.health} />
                          </td>
                          <td className="scs-list-item-sub">{c.status}</td>
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
      <SodaFooter />
    </div>
  );
}
