"use client";

import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";

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
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: "28px 24px",
        }}
      >
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>SODa SCS Stack</p>
        <h1 style={{ margin: "6px 0 20px", fontSize: 28 }}>Health Dashboard</h1>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
            <span style={{ color: "var(--muted)" }}>Username</span>
            <input
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
            <span style={{ color: "var(--muted)" }}>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={inputStyle}
            />
          </label>

          {error && <p style={{ margin: 0, color: "var(--bad)", fontSize: 14 }}>{error}</p>}

          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {showKeycloak && (
          <p style={{ margin: "18px 0 0", color: "var(--muted)", fontSize: 13, textAlign: "center" }}>
            <button
              type="button"
              onClick={() => void signIn("keycloak", { callbackUrl })}
              style={{
                background: "none",
                border: "none",
                color: "#8ab4ff",
                cursor: "pointer",
                padding: 0,
                fontSize: 13,
              }}
            >
              Sign in with Keycloak
            </button>
          </p>
        )}
      </section>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 15,
};

const buttonStyle: React.CSSProperties = {
  marginTop: 4,
  background: "#3b5bdb",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "11px 14px",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};
