# Etsy Product Generator

Turn a theme into a branded, print-ready Etsy product: guided journals, worksheet sets
and planner bundles, exported as A4 + US Letter PDFs with listing images.

- **frontend/**: Angular 22 (standalone, Signals, zoneless) + Tailwind CSS v4. The whole UI is in `src/app/app.ts`.
- **backend/**: Python FastAPI + Jinja2 HTML templates + WeasyPrint (PDF) + pypdfium2 (PNG listing images)

## Features (prototype v0.1)

1. **Generate**: theme, product type, audience, number of prompts → title, intro, journal prompts,
   worksheets, habits, affirmations and closing text.
   - With `ANTHROPIC_API_KEY` set, content is written by Claude.
   - Without a key (or if the API call fails), it uses built-in offline templates so you can still work.
2. **Edit**: change any text, add or remove worksheets, and turn pages on or off
   (cover, how-to-use, journal, worksheets, weekly planner, habit tracker, affirmations, closing).
3. **Brand**: pick a brand, tweak colours, fonts, shop name and closing note. The preview updates
   live; click *Save brand* to keep the changes.
4. **Live preview**: exactly what the PDF will look like, at A4 or US Letter.
5. **Export**: a single PDF, or an **Etsy bundle (.zip)** with A4 + Letter PDFs and four PNG
   listing images.

## Setup

### Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# Optional: AI-written content
# Windows (PowerShell):  $env:ANTHROPIC_API_KEY="sk-ant-..."
# macOS/Linux:           export ANTHROPIC_API_KEY=sk-ant-...
# Optional model override: ANTHROPIC_MODEL (default claude-sonnet-5-5)

uvicorn app.main:app --reload --port 8000
```
WeasyPrint needs the Pango system library. On Windows, follow the "Windows" section of
https://doc.courtbouillon.org/weasyprint/stable/first_steps.html. On macOS: `brew install pango`.

API docs: http://localhost:8000/docs

### Frontend
```bash
cd frontend
npm install
npm start
```
Open http://localhost:4200. Requests to `/api` are proxied to the backend on port 8000.

## Project layout
```
backend/
  app/main.py                 API routes
  app/models.py               request/response + brand models
  app/content.py              Claude content generation + offline fallback
  app/renderer.py             HTML preview, PDF, PNG listing images, zip bundle
  app/templates/product.html  every page layout (one template, sections toggled on/off)
  app/static/fonts/           bundled fonts (SIL Open Font License, OK for commercial use)
  brands/*.json               brand profiles (let's shop it, Calm the Quest)
frontend/
  src/app/app.ts              the whole UI: generate, edit, brand, preview, export
```

## Adding a brand
Copy `backend/brands/lets-shop-it.json` to a new file, change `id` (lowercase letters,
numbers and hyphens, matching the filename), `name`, colours and fonts. Restart the
frontend page; it shows up in the Brand dropdown.

Available fonts: Cormorant Garamond, Lora, Nunito, DM Sans. To add more, drop the
`-latin-400-normal.woff`, `-latin-600-normal.woff` and `-latin-400-italic.woff` files from
[Fontsource](https://fontsource.org) into `app/static/fonts/` and register the name in
`FONT_FILES` (renderer.py) and `FontName` (models.py and app.ts).

## API
| Method | Path | Purpose |
|---|---|---|
| GET | /api/brands | list brands |
| PUT | /api/brands/{id} | save a brand |
| POST | /api/content | generate content for a theme |
| POST | /api/preview | HTML preview |
| POST | /api/render | single PDF |
| POST | /api/bundle | zip: A4 + Letter PDFs + listing PNGs |

## Roadmap
- [x] One template rendering to a branded PDF
- [x] Page types: journal, worksheets, weekly planner, habit tracker, affirmations
- [x] Content editor + live preview
- [x] Claude content generation, A4/Letter bundle, listing images
- [ ] Save and reopen products (projects list)
- [ ] Styled listing mockups (pages on a desk or clipboard background)
- [ ] Etsy listing copy: title, 13 tags, description
- [ ] Clickable table of contents and tabs in the PDF
