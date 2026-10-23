<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Slide Scrape UI decisions

- The folder sidebar shows only **All** and folders created by the user. Do not add a synthetic "Unfiled" or "No folder" sidebar item. Extractions without a folder remain visible in All.
- The extraction's Folder selector still needs a neutral option to remove an assignment; this is an action/state, not a sidebar folder.
- Keep select arrows visibly inset from the right edge: use a controlled icon, enough right padding, and check alignment at desktop and mobile widths. Do not rely on the browser's native arrow placement.
