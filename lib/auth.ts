import type { NextAuthOptions, Session } from "next-auth";
import { getServerSession } from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";
import KeycloakProvider from "next-auth/providers/keycloak";

function buildProviders(): NextAuthOptions["providers"] {
  const providers: NextAuthOptions["providers"] = [];

  const oidcClientId = process.env.SCS_HEALTH_OIDC_CLIENT_ID?.trim();
  const oidcClientSecret = process.env.SCS_HEALTH_OIDC_CLIENT_SECRET?.trim();
  const oidcIssuer =
    process.env.SCS_HEALTH_OIDC_ISSUER?.trim() ??
    (process.env.KC_URL && process.env.KC_REALM
      ? `${process.env.KC_URL.replace(/\/$/, "")}/realms/${process.env.KC_REALM}`
      : undefined);

  if (oidcClientId && oidcClientSecret && oidcIssuer) {
    providers.push(
      KeycloakProvider({
        clientId: oidcClientId,
        clientSecret: oidcClientSecret,
        issuer: oidcIssuer,
      }),
    );
  }

  providers.push(
    CredentialsProvider({
      name: "SCS Health",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const expectedUser = process.env.SCS_HEALTH_AUTH_USER?.trim();
        const expectedPass = process.env.SCS_HEALTH_AUTH_PASSWORD?.trim();
        if (!expectedUser || !expectedPass) return null;

        const username = credentials?.username;
        const password = credentials?.password;
        if (username === expectedUser && password === expectedPass) {
          return { id: "local", name: username };
        }
        return null;
      },
    }),
  );

  return providers;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.SCS_HEALTH_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  providers: buildProviders(),
  session: { strategy: "jwt" },
};

export async function requireSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}
