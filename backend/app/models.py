"""Data models shared by the API, content generator and renderer."""
from typing import Literal

from pydantic import BaseModel, Field

ProductType = Literal["guided_journal", "worksheet_set", "planner_bundle"]
PaperSize = Literal["A4", "Letter"]
SectionKey = Literal[
    "cover", "intro", "journal", "worksheets", "weekly_planner",
    "habit_tracker", "affirmations", "closing",
]

# Which sections each product type includes by default (user can toggle them in the UI)
DEFAULT_SECTIONS: dict[str, list[str]] = {
    "guided_journal": ["cover", "intro", "journal", "affirmations", "closing"],
    "worksheet_set": ["cover", "intro", "worksheets", "closing"],
    "planner_bundle": ["cover", "intro", "weekly_planner", "habit_tracker", "affirmations", "closing"],
}


class Worksheet(BaseModel):
    title: str = Field(max_length=120)
    instructions: str = Field(default="", max_length=600)
    questions: list[str] = Field(default_factory=list, max_length=8)


class ProductContent(BaseModel):
    title: str = Field(max_length=120)
    subtitle: str = Field(default="", max_length=160)
    intro: str = Field(default="", max_length=2000)
    journal_prompts: list[str] = Field(default_factory=list, max_length=60)
    worksheets: list[Worksheet] = Field(default_factory=list, max_length=12)
    habits: list[str] = Field(default_factory=list, max_length=8)
    affirmations: list[str] = Field(default_factory=list, max_length=24)
    closing: str = Field(default="", max_length=1500)


class GenerateContentRequest(BaseModel):
    theme: str = Field(min_length=2, max_length=120)
    product_type: ProductType = "guided_journal"
    audience: str = Field(default="", max_length=200)
    prompt_count: int = Field(default=12, ge=3, le=60)


class GenerateContentResponse(BaseModel):
    content: ProductContent
    sections: list[SectionKey]
    source: Literal["claude", "offline"]
    note: str = ""


class BrandColors(BaseModel):
    primary: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    accent: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    background: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    text: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    lines: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


FontName = Literal["Cormorant Garamond", "Lora", "Nunito", "DM Sans"]


class BrandFonts(BaseModel):
    heading: FontName
    body: FontName


class Brand(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9-]+$", max_length=40)
    name: str = Field(min_length=1, max_length=60)
    shop_name: str = Field(default="", max_length=60)
    colors: BrandColors
    fonts: BrandFonts
    footer_note: str = Field(default="", max_length=160)


class RenderRequest(BaseModel):
    content: ProductContent
    sections: list[SectionKey]
    brand_id: str = Field(default="lets-shop-it", pattern=r"^[a-z0-9-]+$")
    # Optional unsaved brand edits, so the preview updates while you tweak colours
    brand: Brand | None = None
    paper_size: PaperSize = "A4"
