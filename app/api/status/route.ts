import { checkAllWebsites, type StatusResponse } from "@/lib/checks";
import { requireSession } from "@/lib/auth";
import { listContainers } from "@/lib/docker";

export const dynamic = "force-dynamic";

function overallStatus(
  websitesUp: number,
  websitesTotal: number,
  containersUp: number,
  containersTotal: number,
): StatusResponse["summary"]["overall"] {
  if (websitesTotal > 0 && websitesUp === websitesTotal) {
    if (containersTotal === 0 || containersUp === containersTotal) return "healthy";
    if (containersUp >= containersTotal * 0.8) return "degraded";
    return "unhealthy";
  }
  if (websitesUp === 0) return "unhealthy";
  return "degraded";
}

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [websites, containers] = await Promise.all([
    checkAllWebsites(),
    listContainers(),
  ]);

  const websitesUp = websites.filter((w) => w.status === "up").length;
  const containersUp = containers.filter((c) => c.ok).length;

  const body: StatusResponse = {
    checkedAt: new Date().toISOString(),
    summary: {
      websitesUp,
      websitesTotal: websites.length,
      containersUp,
      containersTotal: containers.length,
      overall: overallStatus(websitesUp, websites.length, containersUp, containers.length),
    },
    websites,
    containers,
  };

  const httpStatus =
    body.summary.overall === "healthy"
      ? 200
      : body.summary.overall === "degraded"
        ? 207
        : 503;

  return Response.json(body, { status: httpStatus });
}
