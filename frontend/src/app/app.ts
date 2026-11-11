import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';

// ---------- Types (mirror backend/app/models.py) ----------

type ProductType = 'guided_journal' | 'worksheet_set' | 'planner_bundle';
type PaperSize = 'A4' | 'Letter';
type SectionKey =
  | 'cover' | 'intro' | 'journal' | 'worksheets'
  | 'weekly_planner' | 'habit_tracker' | 'affirmations' | 'closing';
type FontName = 'Cormorant Garamond' | 'Lora' | 'Nunito' | 'DM Sans';
type Tab = 'generate' | 'edit' | 'brand';

interface Worksheet {
  title: string;
  instructions: string;
  questions: string[];
}

interface ProductContent {
  title: string;
  subtitle: string;
  intro: string;
  journal_prompts: string[];
  worksheets: Worksheet[];
  habits: string[];
  affirmations: string[];
  closing: string;
}

interface Brand {
  id: string;
  name: string;
  shop_name: string;
  colors: { primary: string; accent: string; background: string; text: string; lines: string };
  fonts: { heading: FontName; body: FontName };
  footer_note: string;
}

interface GenerateResponse {
  content: ProductContent;
  sections: SectionKey[];
  source: 'claude' | 'offline';
  note: string;
}

type ListKey = 'journal_prompts' | 'habits' | 'affirmations';
type TextKey = 'title' | 'subtitle' | 'intro' | 'closing';
type ColorKey = keyof Brand['colors'];

const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: 'guided_journal', label: 'Guided journal' },
  { value: 'worksheet_set', label: 'Worksheet set' },
  { value: 'planner_bundle', label: 'Planner bundle' },
];

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'cover', label: 'Cover' },
  { key: 'intro', label: 'How to use' },
  { key: 'journal', label: 'Journal prompts' },
  { key: 'worksheets', label: 'Worksheets' },
  { key: 'weekly_planner', label: 'Weekly planner' },
  { key: 'habit_tracker', label: 'Habit tracker' },
  { key: 'affirmations', label: 'Affirmations' },
  { key: 'closing', label: 'Closing page' },
];

const COLOR_KEYS: ColorKey[] = ['primary', 'accent', 'background', 'text', 'lines'];
const FONTS: FontName[] = ['Cormorant Garamond', 'Lora', 'Nunito', 'DM Sans'];

@Component({
  selector: 'app-root',
  styles: `
    :host { display: block; }
    .field { display: block; }
    .field > span { display: block; font-size: 0.75rem; font-weight: 600; color: #57534e; margin-bottom: 0.25rem; }
    .input {
      width: 100%; border: 1px solid #d6d3d1; border-radius: 0.5rem; padding: 0.5rem 0.75rem;
      font-size: 0.875rem; background: white;
    }
    .input:focus { outline: none; border-color: #78716c; }
  `,
  template: `
    <div class="flex h-screen flex-col bg-stone-100 text-stone-800">
      <!-- Top bar -->
      <header class="flex items-center gap-4 border-b border-stone-200 bg-white px-5 py-3">
        <div class="mr-auto">
          <h1 class="text-lg font-semibold tracking-tight">Etsy Product Generator</h1>
          <p class="text-xs text-stone-500">Theme in, print-ready PDF out</p>
        </div>

        <select class="input !w-40" [value]="paperSize()" (change)="paperSize.set($any(val($event)))">
          <option value="A4">A4</option>
          <option value="Letter">US Letter</option>
        </select>

        <button
          class="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-40"
          [disabled]="!content() || busy()"
          (click)="download('render')"
        >
          Download PDF
        </button>
        <button
          class="rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
          [disabled]="!content() || busy()"
          (click)="download('bundle')"
          title="A4 + Letter PDFs and listing images, zipped"
        >
          Etsy bundle (.zip)
        </button>
      </header>

      <div class="flex min-h-0 flex-1">
        <!-- Left panel -->
        <aside class="flex w-[420px] shrink-0 flex-col border-r border-stone-200 bg-white">
          <nav class="flex border-b border-stone-200 text-sm">
            @for (t of tabs; track t.key) {
              <button
                class="flex-1 px-3 py-2.5 font-medium transition"
                [class]="tab() === t.key ? 'border-b-2 border-stone-800 text-stone-900' : 'text-stone-400 hover:text-stone-600'"
                [disabled]="t.key === 'edit' && !content()"
                (click)="tab.set(t.key)"
              >
                {{ t.label }}
              </button>
            }
          </nav>

          <div class="flex-1 space-y-5 overflow-y-auto p-5">
            @if (error()) {
              <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
            }

            <!-- ===== Generate tab ===== -->
            @if (tab() === 'generate') {
              <label class="field">
                <span>Theme</span>
                <input class="input" [value]="theme()" (input)="theme.set(val($event))" placeholder="e.g. Burnout recovery" />
              </label>

              <div class="field">
                <span>Product type</span>
                <div class="grid grid-cols-3 gap-2">
                  @for (p of productTypes; track p.value) {
                    <button
                      class="rounded-lg border px-2 py-2 text-xs font-medium transition"
                      [class]="productType() === p.value ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 hover:bg-stone-50'"
                      (click)="productType.set(p.value)"
                    >
                      {{ p.label }}
                    </button>
                  }
                </div>
              </div>

              <label class="field">
                <span>Audience (optional)</span>
                <input class="input" [value]="audience()" (input)="audience.set(val($event))" placeholder="e.g. new mums, students, remote workers" />
              </label>

              <label class="field">
                <span>Number of journal prompts: {{ promptCount() }}</span>
                <input type="range" min="3" max="60" class="w-full accent-stone-700" [value]="promptCount()" (input)="promptCount.set(+val($event))" />
              </label>

              <button
                class="w-full rounded-lg bg-stone-800 px-4 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
                [disabled]="busy() || theme().trim().length < 2"
                (click)="generate()"
              >
                {{ busy() ? 'Working…' : content() ? 'Regenerate content' : 'Generate content' }}
              </button>

              @if (note()) {
                <p class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{{ note() }}</p>
              }
            }

            <!-- ===== Edit tab ===== -->
            @if (tab() === 'edit' && content(); as c) {
              @if (note()) {
                <p class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{{ note() }}</p>
              }
              <div class="field">
                <span>Pages to include</span>
                <div class="grid grid-cols-2 gap-1.5">
                  @for (s of sectionList; track s.key) {
                    <label class="flex items-center gap-2 text-sm">
                      <input type="checkbox" class="accent-stone-700" [checked]="sections().includes(s.key)" (change)="toggleSection(s.key)" />
                      {{ s.label }}
                    </label>
                  }
                </div>
              </div>

              <label class="field">
                <span>Title</span>
                <input class="input" [value]="c.title" (input)="setText('title', val($event))" />
              </label>
              <label class="field">
                <span>Subtitle</span>
                <input class="input" [value]="c.subtitle" (input)="setText('subtitle', val($event))" />
              </label>
              <label class="field">
                <span>How-to-use text (blank line = new paragraph)</span>
                <textarea rows="5" class="input" [value]="c.intro" (input)="setText('intro', val($event))"></textarea>
              </label>

              @if (sections().includes('journal')) {
                <label class="field">
                  <span>Journal prompts — one per line ({{ c.journal_prompts.length }} pages, updates when you click away)</span>
                  <textarea rows="8" class="input" [value]="c.journal_prompts.join('\\n')" (change)="setList('journal_prompts', val($event))"></textarea>
                </label>
              }

              @if (sections().includes('worksheets')) {
                <div class="field">
                  <span>Worksheets</span>
                  <div class="space-y-3">
                    @for (ws of c.worksheets; track $index; let i = $index) {
                      <div class="space-y-2 rounded-lg border border-stone-200 p-3">
                        <div class="flex gap-2">
                          <input class="input" [value]="ws.title" (input)="setWorksheet(i, 'title', val($event))" placeholder="Title" />
                          <button class="px-2 text-stone-400 hover:text-red-600" (click)="removeWorksheet(i)" title="Remove">✕</button>
                        </div>
                        <input class="input" [value]="ws.instructions" (input)="setWorksheet(i, 'instructions', val($event))" placeholder="Instructions" />
                        <textarea rows="4" class="input" [value]="ws.questions.join('\\n')" (change)="setWorksheet(i, 'questions', val($event))" placeholder="Questions, one per line (max 8)"></textarea>
                      </div>
                    }
                    <button class="w-full rounded-lg border border-dashed border-stone-300 py-2 text-sm text-stone-500 hover:bg-stone-50" (click)="addWorksheet()">
                      + Add worksheet
                    </button>
                  </div>
                </div>
              }

              @if (sections().includes('habit_tracker')) {
                <label class="field">
                  <span>Habits — one per line (max 8)</span>
                  <textarea rows="5" class="input" [value]="c.habits.join('\\n')" (change)="setList('habits', val($event))"></textarea>
                </label>
              }

              @if (sections().includes('affirmations')) {
                <label class="field">
                  <span>Affirmations — one per line (10 per page)</span>
                  <textarea rows="6" class="input" [value]="c.affirmations.join('\\n')" (change)="setList('affirmations', val($event))"></textarea>
                </label>
              }

              <label class="field">
                <span>Closing message</span>
                <textarea rows="4" class="input" [value]="c.closing" (input)="setText('closing', val($event))"></textarea>
              </label>
            }

            <!-- ===== Brand tab ===== -->
            @if (tab() === 'brand' && brand(); as b) {
              <label class="field">
                <span>Brand</span>
                <select class="input" [value]="brandId()" (change)="selectBrand(val($event))">
                  @for (br of brands(); track br.id) {
                    <option [value]="br.id">{{ br.name }}</option>
                  }
                </select>
              </label>

              <label class="field">
                <span>Shop name (cover + footer)</span>
                <input class="input" [value]="b.shop_name" (input)="patchBrand({ shop_name: val($event) })" />
              </label>

              <div class="field">
                <span>Colours</span>
                <div class="grid grid-cols-5 gap-2">
                  @for (k of colorKeys; track k) {
                    <label class="flex flex-col items-center gap-1 text-[11px] capitalize text-stone-500">
                      <input type="color" class="h-10 w-full cursor-pointer rounded border border-stone-200" [value]="b.colors[k]" (input)="setColor(k, val($event))" />
                      {{ k }}
                    </label>
                  }
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <label class="field">
                  <span>Heading font</span>
                  <select class="input" [value]="b.fonts.heading" (change)="setFont('heading', val($event))">
                    @for (f of fonts; track f) { <option [value]="f">{{ f }}</option> }
                  </select>
                </label>
                <label class="field">
                  <span>Body font</span>
                  <select class="input" [value]="b.fonts.body" (change)="setFont('body', val($event))">
                    @for (f of fonts; track f) { <option [value]="f">{{ f }}</option> }
                  </select>
                </label>
              </div>

              <label class="field">
                <span>Note on closing page</span>
                <input class="input" [value]="b.footer_note" (input)="patchBrand({ footer_note: val($event) })" />
              </label>

              <div class="flex items-center gap-3">
                <button
                  class="rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
                  [disabled]="!brandDirty() || busy()"
                  (click)="saveBrand()"
                >
                  Save brand
                </button>
                @if (brandDirty()) { <span class="text-xs text-amber-700">Unsaved changes (preview already shows them)</span> }
              </div>
            }
          </div>
        </aside>

        <!-- Preview -->
        <section class="flex min-w-0 flex-1 flex-col">
          <div class="flex items-center gap-3 px-5 py-2 text-xs text-stone-500">
            <span class="mr-auto">
              @if (content()) { Live preview · {{ paperSize() }} } @else { Generate content to see a preview }
              @if (previewLoading()) { · updating… }
            </span>
            Zoom
            <select class="rounded border border-stone-300 bg-white px-2 py-1" [value]="zoom()" (change)="zoom.set(+val($event))">
              <option value="0.5">50%</option>
              <option value="0.75">75%</option>
              <option value="1">100%</option>
            </select>
          </div>
          @if (previewDoc(); as doc) {
            <iframe class="min-h-0 w-full flex-1 border-0" [srcdoc]="doc" title="Product preview"></iframe>
          } @else {
            <div class="flex flex-1 items-center justify-center text-sm text-stone-400">
              Your pages will appear here.
            </div>
          }
        </section>
      </div>
    </div>
  `,
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly productTypes = PRODUCT_TYPES;
  protected readonly sectionList = SECTIONS;
  protected readonly colorKeys = COLOR_KEYS;
  protected readonly fonts = FONTS;
  protected readonly tabs: { key: Tab; label: string }[] = [
    { key: 'generate', label: '1 · Generate' },
    { key: 'edit', label: '2 · Edit' },
    { key: 'brand', label: '3 · Brand' },
  ];

  // Generate form
  protected readonly theme = signal('Burnout Recovery');
  protected readonly productType = signal<ProductType>('guided_journal');
  protected readonly audience = signal('');
  protected readonly promptCount = signal(12);

  // Product
  protected readonly content = signal<ProductContent | null>(null);
  protected readonly sections = signal<SectionKey[]>([]);
  protected readonly note = signal('');

  // Brands: saved list + an editable draft of the selected one
  protected readonly brands = signal<Brand[]>([]);
  protected readonly brandId = signal('lets-shop-it');
  protected readonly brand = signal<Brand | null>(null);
  protected readonly brandDirty = computed(() => {
    const draft = this.brand();
    const saved = this.brands().find((b) => b.id === draft?.id);
    return !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  });

  // UI
  protected readonly tab = signal<Tab>('generate');
  protected readonly paperSize = signal<PaperSize>('A4');
  protected readonly zoom = signal(0.75);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly previewHtml = signal<string | null>(null);
  protected readonly previewLoading = signal(false);

  /** Everything the backend needs to render; null until content exists. */
  private readonly renderRequest = computed(() => {
    const content = this.content();
    const brand = this.brand();
    if (!content || !brand) return null;
    return { content, sections: this.sections(), brand_id: brand.id, brand, paper_size: this.paperSize() };
  });

  protected readonly previewDoc = computed<SafeHtml | null>(() => {
    const html = this.previewHtml();
    if (!html) return null;
    const zoomed = html.replace('</head>', `<style>html{zoom:${this.zoom()}}</style></head>`);
    // HTML comes from our own backend (Jinja auto-escapes user text), so it's safe to trust here.
    return this.sanitizer.bypassSecurityTrustHtml(zoomed);
  });

  constructor() {
    this.loadBrands();

    // Debounced live preview: re-render 350 ms after the last edit
    effect((onCleanup) => {
      const req = this.renderRequest();
      if (!req) return;
      const timer = setTimeout(() => this.refreshPreview(req), 350);
      onCleanup(() => clearTimeout(timer));
    });
  }

  // ---------- Template helpers ----------

  protected val(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  // ---------- Generate ----------

  protected async generate(): Promise<void> {
    if (this.content() && !confirm('Replace your current content with newly generated content?')) return;
    await this.run(async () => {
      const res = await firstValueFrom(
        this.http.post<GenerateResponse>('/api/content', {
          theme: this.theme().trim(),
          product_type: this.productType(),
          audience: this.audience().trim(),
          prompt_count: this.promptCount(),
        }),
      );
      this.content.set(res.content);
      this.sections.set(res.sections);
      this.note.set(res.note);
      this.tab.set('edit');
    }, 'Could not generate content. Is the backend running on port 8000?');
  }

  // ---------- Edit content ----------

  private patchContent(patch: Partial<ProductContent>): void {
    this.content.update((c) => (c ? { ...c, ...patch } : c));
  }

  protected setText(key: TextKey, value: string): void {
    this.patchContent({ [key]: value });
  }

  protected setList(key: ListKey, value: string): void {
    const max = key === 'habits' ? 8 : key === 'affirmations' ? 24 : 60;
    this.patchContent({ [key]: this.lines(value).slice(0, max) });
  }

  protected setWorksheet(i: number, field: keyof Worksheet, value: string): void {
    const c = this.content();
    if (!c) return;
    const worksheets = c.worksheets.map((ws, idx) =>
      idx !== i ? ws : { ...ws, [field]: field === 'questions' ? this.lines(value).slice(0, 8) : value },
    );
    this.patchContent({ worksheets });
  }

  protected addWorksheet(): void {
    const c = this.content();
    if (!c || c.worksheets.length >= 12) return;
    this.patchContent({
      worksheets: [...c.worksheets, { title: 'New worksheet', instructions: '', questions: ['Question 1', 'Question 2', 'Question 3'] }],
    });
  }

  protected removeWorksheet(i: number): void {
    const c = this.content();
    if (c) this.patchContent({ worksheets: c.worksheets.filter((_, idx) => idx !== i) });
  }

  protected toggleSection(key: SectionKey): void {
    this.sections.update((list) => {
      const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
      return SECTIONS.map((s) => s.key).filter((k) => next.includes(k)); // keep canonical order
    });
  }

  private lines(value: string): string[] {
    return value.split('\n').map((l) => l.trim()).filter(Boolean);
  }

  // ---------- Brand ----------

  private async loadBrands(): Promise<void> {
    try {
      const brands = await firstValueFrom(this.http.get<Brand[]>('/api/brands'));
      this.brands.set(brands);
      const initial = brands.find((b) => b.id === this.brandId()) ?? brands[0];
      if (initial) this.selectBrand(initial.id);
    } catch {
      this.error.set('Could not reach the backend. Start it with: uvicorn app.main:app --reload --port 8000');
    }
  }

  protected selectBrand(id: string): void {
    const found = this.brands().find((b) => b.id === id);
    if (!found) return;
    this.brandId.set(id);
    this.brand.set(structuredClone(found));
  }

  protected patchBrand(patch: Partial<Brand>): void {
    this.brand.update((b) => (b ? { ...b, ...patch } : b));
  }

  protected setColor(key: ColorKey, value: string): void {
    const b = this.brand();
    if (b) this.patchBrand({ colors: { ...b.colors, [key]: value } });
  }

  protected setFont(which: 'heading' | 'body', value: string): void {
    const b = this.brand();
    if (b) this.patchBrand({ fonts: { ...b.fonts, [which]: value as FontName } });
  }

  protected async saveBrand(): Promise<void> {
    const b = this.brand();
    if (!b) return;
    await this.run(async () => {
      const saved = await firstValueFrom(this.http.put<Brand>(`/api/brands/${b.id}`, b));
      this.brands.update((list) => list.map((x) => (x.id === saved.id ? saved : x)));
    }, 'Could not save the brand.');
  }

  // ---------- Preview & export ----------

  private async refreshPreview(req: object): Promise<void> {
    this.previewLoading.set(true);
    try {
      const html = await firstValueFrom(this.http.post('/api/preview', req, { responseType: 'text' }));
      this.previewHtml.set(html);
      this.error.set(null);
    } catch {
      this.error.set('Preview failed. Check the backend terminal for details.');
    } finally {
      this.previewLoading.set(false);
    }
  }

  protected async download(kind: 'render' | 'bundle'): Promise<void> {
    const req = this.renderRequest();
    if (!req) return;
    await this.run(async () => {
      const blob = await firstValueFrom(this.http.post(`/api/${kind}`, req, { responseType: 'blob' }));
      const slug = req.content.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product';
      const name = kind === 'bundle' ? `${slug}-etsy-bundle.zip` : `${slug}-${req.paper_size}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    }, kind === 'bundle' ? 'Bundle export failed.' : 'PDF export failed.');
  }

  private async run(task: () => Promise<void>, failMessage: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await task();
    } catch {
      this.error.set(failMessage);
    } finally {
      this.busy.set(false);
    }
  }
}
