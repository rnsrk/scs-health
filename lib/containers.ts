import type { ContainerResult } from "./checks";

/** Containers that are not fully healthy (stopped, unhealthy, or health starting). */
export function containerHasIssue(container: ContainerResult): boolean {
  if (container.state !== "running") return true;
  if (container.health === "unhealthy" || container.health === "starting") return true;
  return false;
}

export function getContainersWithIssues(containers: ContainerResult[]): ContainerResult[] {
  return containers
    .filter(containerHasIssue)
    .sort((a, b) => a.name.localeCompare(b.name));
}
