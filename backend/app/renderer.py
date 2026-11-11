"""Renders product content + brand into HTML (live preview), PDF and PNG listing images."""
import io
import zipfile
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

from app.models import Brand, RenderRequest

APP_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = APP_DIR / "templates"
FONTS_DIR = APP_DIR / "static" / "fonts"

# Page sizes in mm (width, height)
PAPER = {"A4": (210, 297), "Letter": (215.9, 279.4)}

FONT_FILES = {
    "Cormorant Garamond": "cormorant-garamond",
    "Lora": "lora",
    "Nunito": "nunito",
    "DM Sans": "dm-sans",
}

env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=select_autoescape(["html"]))


def render_html(req: RenderRequest, brand: Brand, preview: bool) -> str:
    width, height = PAPER[req.paper_size]
    # Preview is shown in the browser, so fonts are served over HTTP; the PDF reads them from disk
    font_base = "/api/fonts/" if preview else FONTS_DIR.as_uri() + "/"
    fonts_used = {brand.fonts.heading, brand.fonts.body}
    return env.get_template("product.html").render(
        c=req.content,
        sections=req.sections,
        brand=brand,
        paper_size=req.paper_size,
        page_w=width,
        page_h=height,
        preview=preview,
        font_base=font_base,
        font_faces=[(name, FONT_FILES[name]) for name in sorted(fonts_used)],
    )


def render_pdf(req: RenderRequest, brand: Brand) -> bytes:
    html = render_html(req, brand, preview=False)
    return HTML(string=html, base_url=str(TEMPLATES_DIR)).write_pdf()


def pdf_to_pngs(pdf: bytes, pages: list[int], width_px: int = 1500) -> list[bytes]:
    """Render selected PDF pages to PNG (for Etsy listing images)."""
    import pypdfium2 as pdfium

    doc = pdfium.PdfDocument(pdf)
    images = []
    for i in pages:
        if i >= len(doc):
            continue
        page = doc[i]
        scale = width_px / page.get_width()
        pil = page.render(scale=scale).to_pil()
        buf = io.BytesIO()
        pil.save(buf, format="PNG", optimize=True)
        images.append(buf.getvalue())
    doc.close()
    return images


def build_bundle(req: RenderRequest, brand: Brand) -> bytes:
    """Zip with A4 + Letter PDFs and PNG previews of a few pages, ready for an Etsy listing."""
    slug = _slug(req.content.title)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        a4_pdf = b""
        for size in ("A4", "Letter"):
            pdf = render_pdf(req.model_copy(update={"paper_size": size}), brand)
            zf.writestr(f"{slug}-{size}.pdf", pdf)
            if size == "A4":
                a4_pdf = pdf
        doc_pages = _page_count(a4_pdf)
        picks = sorted({0, 1, 2, doc_pages // 2})
        for n, png in enumerate(pdf_to_pngs(a4_pdf, picks), start=1):
            zf.writestr(f"listing-images/{slug}-page-{n}.png", png)
    return buf.getvalue()


def _page_count(pdf: bytes) -> int:
    import pypdfium2 as pdfium

    doc = pdfium.PdfDocument(pdf)
    n = len(doc)
    doc.close()
    return n


def _slug(text: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in text).strip("-")
    while "--" in out:
        out = out.replace("--", "-")
    return out or "product"
