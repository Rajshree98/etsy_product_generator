"""Etsy Product Generator: FastAPI backend.

Run:  uvicorn app.main:app --reload --port 8000
"""
import json
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles

from app.content import generate_content
from app.models import Brand, GenerateContentRequest, GenerateContentResponse, RenderRequest
from app.renderer import FONTS_DIR, _slug, build_bundle, render_html, render_pdf

BRANDS_DIR = Path(__file__).resolve().parent.parent / "brands"
BRAND_ID = re.compile(r"^[a-z0-9-]+$")

app = FastAPI(title="Etsy Product Generator")
app.mount("/api/fonts", StaticFiles(directory=FONTS_DIR), name="fonts")


# ---------- Brands ----------

def _brand_path(brand_id: str) -> Path:
    if not BRAND_ID.match(brand_id):
        raise HTTPException(status_code=400, detail="Invalid brand id")
    return BRANDS_DIR / f"{brand_id}.json"


def resolve_brand(req: RenderRequest) -> Brand:
    return req.brand if req.brand is not None else load_brand(req.brand_id)


def load_brand(brand_id: str) -> Brand:
    path = _brand_path(brand_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found")
    return Brand.model_validate_json(path.read_text(encoding="utf-8"))


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/brands")
def list_brands() -> list[Brand]:
    return [Brand.model_validate_json(f.read_text(encoding="utf-8")) for f in sorted(BRANDS_DIR.glob("*.json"))]


@app.put("/api/brands/{brand_id}")
def save_brand(brand_id: str, brand: Brand) -> Brand:
    if brand.id != brand_id:
        raise HTTPException(status_code=400, detail="Brand id in URL and body must match")
    _brand_path(brand_id).write_text(json.dumps(brand.model_dump(), indent=2), encoding="utf-8")
    return brand


# ---------- Content ----------

@app.post("/api/content")
def create_content(req: GenerateContentRequest) -> GenerateContentResponse:
    return generate_content(req)


# ---------- Rendering ----------

@app.post("/api/preview", response_class=HTMLResponse)
def preview(req: RenderRequest) -> str:
    return render_html(req, resolve_brand(req), preview=True)


@app.post("/api/render")
def render(req: RenderRequest) -> Response:
    pdf = render_pdf(req, resolve_brand(req))
    filename = f"{_slug(req.content.title)}-{req.paper_size}.pdf"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.post("/api/bundle")
def bundle(req: RenderRequest) -> Response:
    data = build_bundle(req, resolve_brand(req))
    filename = f"{_slug(req.content.title)}-etsy-bundle.zip"
    return Response(data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})
