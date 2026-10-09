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
      <body>
        <div className="site-content">{children}</div>
        <footer className="site-footer">
          Slide Scrape is powered by <a href="https://i7os.com">i7OS</a>
        </footer>
      </body>
    </html>
  );
}
