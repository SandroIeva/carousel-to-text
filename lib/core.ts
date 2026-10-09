import type { Job, Slide } from "./types";
export function normalizeUrl(input: unknown) {
  if (typeof input !== "string" || input.length > 2048)
    throw new Error(
      "Please enter an Instagram, LinkedIn or Threads post link.",
    );
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new Error("Invalid link.");
  }
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.port
  )
    throw new Error("Please use a public post link.");
  if (["instagram.com", "www.instagram.com"].includes(u.hostname)) {
    const match = u.pathname.match(/^\/(p|reel)\/([A-Za-z0-9_-]{1,100})\/?$/);
    if (match) return `https://www.instagram.com/${match[1]}/${match[2]}/`;
  }
  if (/^(?:www\.|[a-z]{2}\.)?linkedin\.com$/.test(u.hostname)) {
    // Curly requires the public, author-bearing /posts/ URL, not feed aliases.
    const match = u.pathname.match(
      /^\/posts\/([A-Za-z0-9_-]+-activity-\d{10,25}-[A-Za-z0-9_-]+)\/?$/,
    );
    if (match) return `https://www.linkedin.com/posts/${match[1]}`;
    throw new Error(
      "Use the LinkedIn /posts/ link copied from the public post, not a /feed/update/ link.",
    );
  }
  if (
    [
      "threads.com",
      "www.threads.com",
      "threads.net",
      "www.threads.net",
    ].includes(u.hostname)
  ) {
    const match = u.pathname.match(
      /^\/@([A-Za-z0-9._]{1,100})\/post\/([A-Za-z0-9_-]{1,100})\/?$/,
    );
    if (match) return `https://www.threads.com/@${match[1]}/post/${match[2]}`;
  }
  throw new Error(
    "Please use a public Instagram, LinkedIn or Threads post link.",
  );
}
export function platformFor(url: string): "instagram" | "linkedin" | "threads" {
  const host = new URL(normalizeUrl(url)).hostname;
  return host === "www.linkedin.com"
    ? "linkedin"
    : host === "www.threads.com"
      ? "threads"
      : "instagram";
}
export function platformLabel(url: string) {
  return { instagram: "Instagram", linkedin: "LinkedIn", threads: "Threads" }[
    platformFor(url)
  ];
}
export function validateImageUrl(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !["cdninstagram.com", "fbcdn.net", "media.licdn.com"].some(
      (h) => u.hostname === h || u.hostname.endsWith("." + h),
    )
  )
    throw new Error("Unexpected image source.");
  return u.toString();
}
type Row = Record<string, unknown>;
export function parseSlides(post: Row): Slide[] {
  if (
    post.textOnly === true &&
    typeof post.caption === "string" &&
    post.caption.trim()
  )
    return [
      {
        position: 1,
        imageUrl: null,
        kind: "text",
        status: "completed",
        text: post.caption,
      },
    ];
  let rows: unknown[] = [];
  if (Array.isArray(post.childPosts) && post.childPosts.length)
    rows = post.childPosts;
  else if (post.type === "Video") rows = [post];
  else if (Array.isArray(post.images) && post.images.length) rows = post.images;
  else if (post.displayUrl) rows = [post];
  if (!rows.length) throw new Error("No slides found.");
  if (rows.length > 25)
    throw new Error(
      "Carousels with more than 25 slides are not supported yet.",
    );
  return rows.map((item, i) => {
    const r: Row =
      typeof item === "string"
        ? { displayUrl: item }
        : item && typeof item === "object"
          ? (item as Row)
          : {};
    const video = r.type === "Video" || r.isVideo === true;
    const source = r.displayUrl || r.url;
    return {
      position: i + 1,
      imageUrl:
        !video && typeof source === "string" ? validateImageUrl(source) : null,
      kind: video ? "video" : "image",
      status: video
        ? "unsupported"
        : typeof source === "string"
          ? "pending"
          : "failed",
      text: "",
      ...(video
        ? {
            error:
              "Video slide: text recognition is available for images only.",
          }
        : typeof source !== "string"
          ? { error: "Image source is missing." }
          : {}),
    };
  });
}
export function exportJob(
  job: Pick<
    Job,
    "id" | "url" | "owner" | "caption" | "slides" | "created_at" | "status"
  >,
  format: string,
) {
  const slideText = (s: Slide) =>
    s.status === "completed" ? s.text : `[${s.error || "Not processed yet"}]`;
  if (format === "json")
    return {
      body: JSON.stringify(
        {
          id: job.id,
          source: job.url,
          creator: job.owner,
          createdAt: job.created_at,
          status: job.status,
          caption: job.caption,
          slides: job.slides.map((s) => ({
            position: s.position,
            kind: s.kind,
            status: s.status,
            text: s.text,
            error: s.error || null,
          })),
        },
        null,
        2,
      ),
      type: "application/json",
      extension: "json",
    };
  const md =
    `# ${platformLabel(job.url)} Content\n\nSource: ${job.url}\nCreator: ${job.owner || "unknown"}\nSlides: ${job.slides.length}\n` +
    job.slides
      .map((s) => `\n---\n\n## Slide ${s.position}\n\n${slideText(s)}\n`)
      .join("") +
    `\n---\n\n## Original Caption\n\n${job.caption || "[No caption available]"}\n`;
  if (format === "md")
    return { body: md, type: "text/markdown", extension: "md" };
  if (format === "txt")
    return {
      body:
        `${platformLabel(job.url)} Content\nSource: ${job.url}\nCreator: ${job.owner || "unknown"}\n\n` +
        job.slides
          .map(
            (s) =>
              `Slide ${s.position}\n${slideText(s)
                .replace(/^#{1,6} +/gm, "")
                .replace(/\*\*(.*?)\*\*/g, "$1")}\n`,
          )
          .join("\n") +
        `\nOriginal Caption\n${job.caption || ""}\n`,
      type: "text/plain",
      extension: "txt",
    };
  throw new Error("Unknown export format.");
}
