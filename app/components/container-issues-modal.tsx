"use client";

import { useEffect } from "react";

import type { ContainerResult } from "@/lib/checks";

type ContainerIssuesModalProps = {
  open: boolean;
  containers: ContainerResult[];
  onClose: () => void;
};

function issueLabel(container: ContainerResult): string {
  if (container.state !== "running") return container.state;
  return container.health;
}

export function ContainerIssuesModal({ open, containers, onClose }: ContainerIssuesModalProps) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="scs-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="scs-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="container-issues-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="scs-modal-header">
          <h2 id="container-issues-title" className="scs-modal-title">
            Containers not fully up
          </h2>
          <button type="button" className="scs-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <p className="scs-modal-summary">
          {containers.length} container{containers.length === 1 ? "" : "s"} stopped, unhealthy, or
          starting
        </p>
        <ul className="scs-modal-list">
          {containers.map((container) => (
            <li key={container.name} className="scs-modal-list-item">
              <span className="scs-modal-list-name">{container.name}</span>
              <span className={`scs-badge scs-badge--${badgeVariant(container)}`}>
                {issueLabel(container)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function badgeVariant(container: ContainerResult): string {
  if (container.state !== "running") return "down";
  if (container.health === "unhealthy") return "unhealthy";
  if (container.health === "starting") return "starting";
  return "none";
}
