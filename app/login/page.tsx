import { Suspense } from "react";

import { LoginForm } from "./login-form";

// OIDC vars are set at container runtime, not image build time.
export const dynamic = "force-dynamic";

function oidcEnabled(): boolean {
  const clientId = process.env.SCS_HEALTH_OIDC_CLIENT_ID?.trim();
  const clientSecret = process.env.SCS_HEALTH_OIDC_CLIENT_SECRET?.trim();
  const issuer =
    process.env.SCS_HEALTH_OIDC_ISSUER?.trim() ??
    (process.env.KC_URL && process.env.KC_REALM
      ? `${process.env.KC_URL.replace(/\/$/, "")}/realms/${process.env.KC_REALM}`
      : undefined);
  return Boolean(clientId && clientSecret && issuer);
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p style={{ padding: 32 }}>Loading…</p>}>
      <LoginForm showKeycloak={oidcEnabled()} />
    </Suspense>
  );
}
