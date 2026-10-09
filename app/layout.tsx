import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "SlideScript — Carousel to Text",
  description: "Instagram-Carousels originalgetreu in Text umwandeln.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
