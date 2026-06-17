import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ContainerResult } from "./checks";

const execFileAsync = promisify(execFile);

type DockerRow = {
  Names: string;
  State: string;
  Status: string;
  Health?: string;
};

function parseHealth(status: string): ContainerResult["health"] {
  if (status.includes("(healthy)")) return "healthy";
  if (status.includes("(unhealthy)")) return "unhealthy";
  if (status.includes("(health: starting)")) return "starting";
  return "none";
}

function containerOk(row: DockerRow): boolean {
  if (row.State !== "running") return false;
  const health = parseHealth(row.Status);
  if (health === "unhealthy") return false;
  return true;
}

export async function listContainers(): Promise<ContainerResult[]> {
  if (process.env.SCS_HEALTH_DOCKER_ENABLED === "false") {
    return [];
  }

  try {
    const { stdout } = await execFileAsync("docker", [
      "ps",
      "-a",
      "--format",
      "{{json .}}",
    ]);

    const rows = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as DockerRow);

    return rows
      .filter((row) => row.Names && !row.Names.startsWith("scs-health"))
      .map((row) => ({
        name: row.Names,
        state: row.State,
        status: row.Status,
        health: parseHealth(row.Status),
        ok: containerOk(row),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
