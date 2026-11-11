"""Content generation: Claude API when a key is set, offline templates otherwise."""
import json
import os
import random
import re

from app.models import (
    DEFAULT_SECTIONS, GenerateContentRequest, GenerateContentResponse,
    ProductContent, Worksheet,
)

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")

SYSTEM_PROMPT = """You write content for printable self-reflection products sold on Etsy
(guided journals, worksheets, planners). Voice: calm, warm, plain English, gentle and
non-judgemental. These are self-reflection tools, not therapy: never diagnose, never promise
to treat or cure anything, avoid clinical claims. Keep every prompt short enough to print as a
page heading (max ~20 words). Reply with ONLY a JSON object, no markdown fences."""

USER_TEMPLATE = """Theme: {theme}
Product type: {product_type}
Audience: {audience}

Return JSON with exactly these keys:
{{
  "title": "product title, max 6 words",
  "subtitle": "one short line",
  "intro": "2 short paragraphs on how to use this product, separated by \\n\\n",
  "journal_prompts": [{prompt_count} distinct journal prompts that build gently from awareness to action],
  "worksheets": [4 objects: {{"title": "...", "instructions": "1-2 sentences", "questions": [3-4 short questions]}}],
  "habits": [6 small daily habits related to the theme, max 4 words each],
  "affirmations": [10 short affirmations],
  "closing": "one warm closing paragraph"
}}"""


def generate_content(req: GenerateContentRequest) -> GenerateContentResponse:
    sections = DEFAULT_SECTIONS[req.product_type]
    if os.getenv("ANTHROPIC_API_KEY"):
        try:
            content = _generate_with_claude(req)
            return GenerateContentResponse(content=content, sections=sections, source="claude")
        except Exception as exc:  # fall back rather than fail the whole request
            return GenerateContentResponse(
                content=_generate_offline(req), sections=sections, source="offline",
                note=f"Claude API call failed ({type(exc).__name__}); used offline templates instead.",
            )
    return GenerateContentResponse(
        content=_generate_offline(req), sections=sections, source="offline",
        note="No ANTHROPIC_API_KEY set: using offline templates. Edit the text before exporting.",
    )


def _generate_with_claude(req: GenerateContentRequest) -> ProductContent:
    import anthropic  # imported lazily so the app runs without a key

    client = anthropic.Anthropic()
    msg = client.messages.create(
        model=MODEL,
        max_tokens=4000,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": USER_TEMPLATE.format(
                theme=req.theme,
                product_type=req.product_type.replace("_", " "),
                audience=req.audience or "adults looking for gentle self-reflection",
                prompt_count=req.prompt_count,
            ),
        }],
    )
    text = "".join(block.text for block in msg.content if block.type == "text")
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    return ProductContent.model_validate(json.loads(text))


# ---------- Offline fallback ----------

_PROMPTS = [
    "What does {t} look like in my life right now?",
    "When did I first notice I needed to focus on {t}?",
    "What has been taking more energy from me than it gives back?",
    "Where in my body do I feel this most, and what is it telling me?",
    "What am I carrying that was never mine to carry?",
    "What would a gentler version of today look like?",
    "Which moments this week felt lighter, even a little?",
    "What do I need more of right now? What do I need less of?",
    "What story am I telling myself about this, and is it the whole story?",
    "If a close friend felt this way, what would I say to them?",
    "What is one boundary that would protect my energy?",
    "Who or what helps me feel safe and steady?",
    "What did I used to enjoy that I have drifted away from?",
    "What does rest really mean for me, beyond sleep?",
    "What am I proud of handling recently, however small?",
    "What expectation can I soften or let go of this week?",
    "What would change if I treated {t} as a priority, not a luxury?",
    "What small step toward feeling better can I take tomorrow?",
    "What am I learning about myself through {t}?",
    "How do I want to feel a month from now?",
    "What does support look like, and how could I ask for it?",
    "What is within my control today, and what isn't?",
    "Which thoughts keep returning, and what do they need from me?",
    "What would I like to tell my future self about this season?",
]

_WORKSHEETS = [
    Worksheet(title="Check-In", instructions="Pause and notice where you are today, without judging it.",
              questions=["How am I feeling, in one word?", "What is on my mind most?",
                         "What does my body need right now?", "One kind thing I can do for myself today:"]),
    Worksheet(title="Drains & Restores", instructions="List what takes your energy and what gives it back.",
              questions=["What drains me:", "What restores me:", "One drain I can reduce this week:",
                         "One restorer I can add this week:"]),
    Worksheet(title="Boundaries Map", instructions="Notice where your limits are being crossed and what you want instead.",
              questions=["Where do I feel stretched too thin?", "What would I like to say no to?",
                         "What would I like to say yes to?", "How can I say it kindly?"]),
    Worksheet(title="Small Steps Plan", instructions="Break one change into steps small enough to start today.",
              questions=["The change I want:", "Why it matters to me:", "Three tiny first steps:",
                         "What might get in the way, and how I'll handle it:"]),
]

_HABITS = ["Drink water", "Move gently", "Step outside", "Screen-free hour", "Journal 5 min", "Sleep on time"]

_AFFIRMATIONS = [
    "I am allowed to rest.", "I am doing the best I can with what I have.", "Small steps still count.",
    "My needs matter.", "I can go at my own pace.", "I am learning to be gentle with myself.",
    "It is okay to ask for help.", "I can let go of what I cannot control.",
    "Today, enough is enough.", "I am becoming steadier, one day at a time.",
]


def _generate_offline(req: GenerateContentRequest) -> ProductContent:
    theme = req.theme.strip()
    t = theme.lower()
    rng = random.Random(t)  # same theme -> same picks, so results are reproducible
    # Keep the first two theme-specific prompts, then sample the rest
    pool = _PROMPTS[:2] + rng.sample(_PROMPTS[2:], len(_PROMPTS) - 2)
    prompts = [(pool[i % len(pool)]).format(t=t) for i in range(req.prompt_count)]
    kind = req.product_type.replace("_", " ")
    return ProductContent(
        title=theme.title(),
        subtitle=f"A gentle {kind} for {t}",
        intro=(
            f"This {kind} is a quiet space to explore {t} at your own pace. There are no right "
            "or wrong answers, and you don't need to finish it in order.\n\n"
            "Choose a page that speaks to you, find a calm moment, and write whatever comes up. "
            "Come back to it whenever you need to."
        ),
        journal_prompts=prompts,
        worksheets=_WORKSHEETS,
        habits=_HABITS,
        affirmations=_AFFIRMATIONS,
        closing=(
            "Thank you for giving yourself this time. Whatever you wrote here, and whatever you "
            "didn't, is enough. Return to these pages whenever you need a softer place to land."
        ),
    )
