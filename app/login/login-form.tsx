"use client";

import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";

import { MenuBarDivider } from "@/app/components/menu-bar-divider";
import { SodaFooter } from "@/app/components/soda-footer";

type LoginFormProps = {
  showKeycloak: boolean;
};

export function LoginForm({ showKeycloak }: LoginFormProps) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
      callbackUrl,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid username or password.");
      return;
    }

    window.location.href = result?.url ?? callbackUrl;
  }

  return (
    <div className="scs-login-shell">
      <MenuBarDivider />
      <main className="scs-login-main">
        <section className="scs-login-card">
          <p className="scs-eyebrow">SODa SCS Stack</p>
          <h1>Health Dashboard</h1>

          <form className="scs-form" onSubmit={onSubmit}>
            <label className="scs-label">
              <span>Username</span>
              <input
                className="scs-input"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>

            <label className="scs-label">
              <span>Password</span>
              <input
                className="scs-input"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {error && <p className="scs-error">{error}</p>}

            <button type="submit" disabled={loading} className="scs-btn scs-btn-primary">
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {showKeycloak && (
            <div className="scs-login-divider">
              <button
                type="button"
                className="scs-btn scs-btn-secondary"
                onClick={() => void signIn("keycloak", { callbackUrl })}
              >
                Sign in with Keycloak
              </button>
            </div>
          )}
        </section>
      </main>
      <SodaFooter />
    </div>
  );
}
