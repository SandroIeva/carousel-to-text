import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Slide Scrape — Carousel to Text",
  description:
    "Extract faithful text from Instagram, LinkedIn and Threads posts, slide by slide.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
