import Link from "next/link";
export default function Home() {
  return (
    <main className="landing">
      <nav>
        <Link href="/" className="brand">
          ▤ SlideScript
        </Link>
        <Link className="button secondary" href="/login">
          Anmelden →
        </Link>
      </nav>
      <section className="hero">
        <span className="eyebrow">CAROUSEL → TEXT</span>
        <h1>
          Gute Inhalte.
          <br />
          <em>Jetzt als Text.</em>
        </h1>
        <p>
          Verwandle Instagram-Carousels in durchsuchbaren Text. Slide für Slide,
          in der Originalsprache — bereit für deinen nächsten Schritt.
        </p>
        <Link href="/login" className="button">
          Kostenlos starten ↗
        </Link>
        <small>Markdown · TXT · JSON</small>
        <div className="hero-card">
          <span className="tag">DEIN WORKFLOW</span>
          <h2>Ein Link. Alle Slides.</h2>
          <div className="flow">
            <span>
              01
              <br />
              <b>Link einfügen</b>
            </span>
            <span>
              02
              <br />
              <b>Text extrahieren</b>
            </span>
            <span>
              03
              <br />
              <b>Exportieren</b>
            </span>
          </div>
        </div>
      </section>
      <footer>
        SlideScript · Öffentliche Instagram-Posts · Texterkennung mit Gemini
      </footer>
    </main>
  );
}
