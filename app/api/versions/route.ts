import { requireSession } from "@/lib/auth";
import { checkImageVersions } from "@/lib/images";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await checkImageVersions());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Version check failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
