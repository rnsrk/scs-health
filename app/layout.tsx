import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Providers } from "./providers";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--scs-font",
});

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
    <html lang="en" className={inter.variable}>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
