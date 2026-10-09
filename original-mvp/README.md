# Carousel → Text (MVP)

A small local Flask web app that imports publicly accessible Instagram post images via Apify, transcribes them using Gemini 2.5 Flash-Lite, and exports one Markdown file.

## Setup

1. Install Python 3.10+.
2. `python -m venv .venv` and activate the virtual environment.
3. `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` and fill in your **server-side** API keys.
5. Start: `python -m flask --app app run` (python-dotenv loads `.env` automatically if installed).
6. Visit http://127.0.0.1:5000.

Get Apify API token at https://console.apify.com/account/integrations. Get Gemini API key at https://aistudio.google.com/apikey. Do not commit `.env` or expose API keys in frontend code.

## Limitations

- This MVP supports public Instagram post/carousel image URLs only. No LinkedIn or Threads yet.
- Video slides are not transcribed; items containing only video slides can yield missing results.
- Apify Actor is a third-party provider and access, reliability and terms may change.
- Source image links can expire; images are fetched immediately and held in memory, not stored.
- Limited to up to 25 slide images and 8 MB per image.
- Gemini may make transcription mistakes; review critical facts, especially charts.
- This is a local prototype, **not a production-ready public service**. Add authentication, quotas/rate limits, background jobs, and privacy safeguards before publishing.
- No live external integration test has been performed without your API credentials.

## API

POST `/api/extract` JSON `{"url":"https://www.instagram.com/p/SHORTCODE/"}` returns `markdown`, `slides`, and `failed`.
