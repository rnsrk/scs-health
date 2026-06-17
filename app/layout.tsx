import type { Metadata } from "next";

import { Providers } from "./providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "SCS Health",
  description: "Service and website health dashboard for the SCS stack",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
