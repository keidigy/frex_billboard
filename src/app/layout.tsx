import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Frex Billboard",
  description: "League-based stock return billboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
