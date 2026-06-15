# Note Markdown Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make note detail render Markdown correctly and provide permanent, cancellable yellow highlights with a WeChat Reading-style H5 selection toolbar, while WeChat Mini Program renders Markdown and saved highlights with native text copy.

**Architecture:** The server owns canonical Markdown rendering, plain-text extraction, highlight reconciliation, and HTML highlight injection. Highlights persist as text quote plus position selectors. H5 uses the browser Selection API to create and cancel highlights; WeChat uses `RichText` with native text selection and consumes the same server-rendered HTML.

**Tech Stack:** Taro 4, React 18, NestJS, PostgreSQL/Supabase RLS, Drizzle schema, `marked`, `isomorphic-dompurify`, `node-html-parser`, Node test runner through `tsx`.

---

## File Map

**Create**

- `server/migrations/0008_note_highlights.sql`: table, indexes, constraints, trigger, and RLS policies.
- `server/src/notes/highlight-anchor.ts`: pure text-anchor resolution and overlap rules.
- `server/src/notes/highlight-renderer.ts`: Markdown/HTML normalization, plain-text extraction, and highlight span injection.
- `server/src/notes/highlight-persistence.ts`: raw PostgreSQL CRUD and reconciliation transaction helpers.
- `server/src/notes/highlight-anchor.test.ts`: anchor algorithm tests.
- `server/src/notes/highlight-renderer.test.ts`: Markdown and HTML injection tests.
- `server/src/notes/highlight-persistence.test.ts`: database ownership, create, delete, overlap, and reconciliation tests.
- `src/pages/note-detail/selection-logic.ts`: H5 selection offsets, context, overlap, and toolbar placement.
- `src/pages/note-detail/selection-logic.test.ts`: browser-independent selection helper tests.
- `src/components/note-selection-toolbar.tsx`: H5 floating action toolbar using project UI Buttons.

**Modify**

- `server/package.json`: add the direct HTML parser dependency.
- `pnpm-lock.yaml`: lock dependency through pnpm.
- `server/src/storage/database/shared/schema.ts`: add `noteHighlights`.
- `server/src/notes/dto.ts`: add create-highlight DTO.
- `server/src/notes/notes.service.ts`: return rendered content and reconcile highlights.
- `server/src/notes/notes.controller.ts`: add highlight create/delete routes.
- `src/pages/note-detail/index.tsx`: render server HTML, H5 selection lifecycle, existing-highlight actions, and WeChat `RichText`.
- `src/app.css`: Markdown reading typography and highlight styling.
- `package.json`: add a focused highlight test command.
- `docs/ROADMAP.md`: record feature state and cross-platform boundary.

### Task 1: Add the highlight persistence model

**Files:**
- Create: `server/migrations/0008_note_highlights.sql`
- Modify: `server/src/storage/database/shared/schema.ts`

- [ ] **Step 1: Write migration contract assertions**

Create `server/src/notes/highlight-migration.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../../migrations/0008_note_highlights.sql', import.meta.url),
  'utf8',
)

test('creates user-owned note highlights with RLS and anchor constraints', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS note_highlights/)
  assert.match(migration, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/)
  assert.match(migration, /REFERENCES notes\(id\) ON DELETE CASCADE/)
  assert.match(migration, /end_offset > start_offset/)
  assert.match(migration, /ALTER TABLE note_highlights ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /note_highlights_select_own/)
  assert.match(migration, /note_highlights_insert_own/)
  assert.match(migration, /note_highlights_update_own/)
  assert.match(migration, /note_highlights_delete_own/)
})
```

- [ ] **Step 2: Run the migration test and verify RED**

Run:

```bash
pnpm exec tsx --test server/src/notes/highlight-migration.test.ts
```

Expected: FAIL because `0008_note_highlights.sql` does not exist.

- [ ] **Step 3: Create migration `0008_note_highlights.sql`**

Use this schema:

```sql
CREATE TABLE IF NOT EXISTS note_highlights (
  id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id       VARCHAR(36) NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  selected_text TEXT NOT NULL CHECK (length(btrim(selected_text)) > 0),
  prefix_text   TEXT NOT NULL DEFAULT '',
  suffix_text   TEXT NOT NULL DEFAULT '',
  start_offset  INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset    INTEGER NOT NULL CHECK (end_offset > start_offset),
  source_hash   VARCHAR(64) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS note_highlights_user_note_idx
  ON note_highlights(user_id, note_id, start_offset);

CREATE UNIQUE INDEX IF NOT EXISTS note_highlights_exact_uq
  ON note_highlights(user_id, note_id, source_hash, start_offset, end_offset);

ALTER TABLE note_highlights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "note_highlights_select_own" ON note_highlights;
DROP POLICY IF EXISTS "note_highlights_insert_own" ON note_highlights;
DROP POLICY IF EXISTS "note_highlights_update_own" ON note_highlights;
DROP POLICY IF EXISTS "note_highlights_delete_own" ON note_highlights;

CREATE POLICY "note_highlights_select_own"
  ON note_highlights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "note_highlights_insert_own"
  ON note_highlights FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "note_highlights_update_own"
  ON note_highlights FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "note_highlights_delete_own"
  ON note_highlights FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS note_highlights_set_updated_at ON note_highlights;
CREATE TRIGGER note_highlights_set_updated_at
  BEFORE UPDATE ON note_highlights
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 4: Add the matching Drizzle model**

Add `noteHighlights` to `server/src/storage/database/shared/schema.ts` with the same column names, indexes, unique index, and `note_id` cascade reference.

- [ ] **Step 5: Run tests and compile**

Run:

```bash
pnpm exec tsx --test server/src/notes/highlight-migration.test.ts
pnpm build:server
```

Expected: PASS.

- [ ] **Step 6: Apply the migration to the configured Supabase database**

Load `.env.local`, wrap the SQL as JSON, and call the same Supabase Management API flow documented in `docs/KNOWLEDGE.md`:

```bash
set -a
source .env.local
set +a
PAYLOAD=$(node -e "process.stdout.write(JSON.stringify({query: require('fs').readFileSync('./server/migrations/0008_note_highlights.sql','utf8')}))")
curl -sS -X POST \
  "https://api.supabase.com/v1/projects/hgpxchebcipynrfjssiq/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "$PAYLOAD"
```

Then verify:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'note_highlights'
ORDER BY ordinal_position;

SELECT policyname
FROM pg_policies
WHERE tablename = 'note_highlights'
ORDER BY policyname;
```

Expected: 11 columns and four ownership policies.

- [ ] **Step 7: Commit**

```bash
git add server/migrations/0008_note_highlights.sql \
  server/src/storage/database/shared/schema.ts \
  server/src/notes/highlight-migration.test.ts
git commit -m "feat: 新增笔记高亮数据模型"
```

### Task 2: Build the pure anchor resolution engine

**Files:**
- Create: `server/src/notes/highlight-anchor.ts`
- Create: `server/src/notes/highlight-anchor.test.ts`

- [ ] **Step 1: Write failing anchor tests**

Define the public contract:

```ts
export interface HighlightAnchor {
  selectedText: string
  prefixText: string
  suffixText: string
  startOffset: number
  endOffset: number
  sourceHash: string
}

export interface ResolvedAnchor {
  startOffset: number
  endOffset: number
}

export function resolveHighlightAnchor(
  text: string,
  anchor: HighlightAnchor,
  currentHash: string,
): ResolvedAnchor | null

export function rangesOverlap(
  left: Pick<ResolvedAnchor, 'startOffset' | 'endOffset'>,
  right: Pick<ResolvedAnchor, 'startOffset' | 'endOffset'>,
): boolean
```

Tests must cover:

```ts
test('uses original offsets when hash and selected text still match')
test('relocates a quote after text is inserted before it')
test('uses prefix and suffix to choose one repeated quote')
test('returns null when repeated quote candidates have equal context score')
test('returns null when selected text no longer exists')
test('treats touching ranges as non-overlapping')
test('treats intersecting ranges as overlapping')
```

- [ ] **Step 2: Run tests and verify RED**

```bash
pnpm exec tsx --test server/src/notes/highlight-anchor.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the resolver**

Implementation rules:

```ts
const CONTEXT_LIMIT = 32

function contextScore(
  text: string,
  startOffset: number,
  selectedText: string,
  prefixText: string,
  suffixText: string,
) {
  const actualPrefix = text.slice(
    Math.max(0, startOffset - CONTEXT_LIMIT),
    startOffset,
  )
  const endOffset = startOffset + selectedText.length
  const actualSuffix = text.slice(endOffset, endOffset + CONTEXT_LIMIT)
  return commonSuffixLength(actualPrefix, prefixText)
    + commonPrefixLength(actualSuffix, suffixText)
}
```

Resolution order:

1. Accept old offsets only when hash and substring both match.
2. Find every exact `selectedText` occurrence.
3. Score context.
4. Sort by score descending, then distance to old position ascending.
5. Return null if the two best candidates have the same score and distance.

- [ ] **Step 4: Run anchor tests**

```bash
pnpm exec tsx --test server/src/notes/highlight-anchor.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/notes/highlight-anchor.ts \
  server/src/notes/highlight-anchor.test.ts
git commit -m "feat: 实现高亮锚点重定位"
```

### Task 3: Build canonical Markdown rendering and highlight injection

**Files:**
- Modify: `server/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `server/src/notes/highlight-renderer.ts`
- Create: `server/src/notes/highlight-renderer.test.ts`

- [ ] **Step 1: Add failing renderer tests**

The renderer API:

```ts
export interface RenderHighlight {
  id: string
  selectedText: string
  startOffset: number
  endOffset: number
}

export interface RenderedNoteContent {
  html: string
  text: string
  hash: string
}

export function renderNoteMarkdown(markdown: string): RenderedNoteContent

export function injectHighlights(
  html: string,
  highlights: RenderHighlight[],
): string
```

Tests:

```ts
test('renders headings, bold text, lists and blockquotes without markdown markers')
test('removes script tags and unsafe attributes')
test('extracts decoded text content in document order')
test('generates a stable sha256 hash from rendered plain text')
test('injects a highlight that crosses strong and plain text nodes')
test('injects several non-overlapping highlights without nested spans')
test('escapes highlight ids before writing data attributes')
```

- [ ] **Step 2: Verify renderer tests fail**

```bash
pnpm exec tsx --test server/src/notes/highlight-renderer.test.ts
```

Expected: FAIL because the renderer module does not exist.

- [ ] **Step 3: Add the HTML parser with pnpm**

```bash
pnpm --filter server add node-html-parser
```

- [ ] **Step 4: Implement canonical rendering**

`renderNoteMarkdown` must:

```ts
const rawHtml = marked.parse(markdown ?? '', { async: false }) as string
const safeHtml = DOMPurify.sanitize(rawHtml)
const root = parse(safeHtml)
const text = root.textContent
const hash = createHash('sha256').update(text).digest('hex')
return { html: safeHtml, text, hash }
```

If `marked` throws, escape the source and return one safe `<p>` block rather than failing the detail request.

- [ ] **Step 5: Implement range-to-text-node injection**

Parse HTML, walk text nodes in document order, and maintain a cumulative character offset. Apply highlights in descending offset order. For every intersecting text node, split its text into before/highlight/after segments and wrap only the intersecting segment:

```html
<span
  data-highlight-id="..."
  style="background-color:#F6D365;border-radius:2px;padding:0 1px;"
>selected text</span>
```

Reject overlapping input ranges before mutation.

- [ ] **Step 6: Run renderer tests and server build**

```bash
pnpm exec tsx --test server/src/notes/highlight-renderer.test.ts
pnpm build:server
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/package.json pnpm-lock.yaml \
  server/src/notes/highlight-renderer.ts \
  server/src/notes/highlight-renderer.test.ts
git commit -m "feat: 统一渲染Markdown与高亮"
```

### Task 4: Add transactional highlight persistence and reconciliation

**Files:**
- Create: `server/src/notes/highlight-persistence.ts`
- Create: `server/src/notes/highlight-persistence.test.ts`

- [ ] **Step 1: Write failing PostgreSQL integration tests**

Use temporary tables following the existing patterns in:

- `server/src/ai/daily-brief-persistence.test.ts`
- `server/src/stocks/trade-persistence.test.ts`

Test:

```ts
test('creates and reads a highlight owned by the current user')
test('does not read or delete another user highlight')
test('rejects an overlapping highlight for the same source hash')
test('updates relocated anchors and removes invalid anchors atomically')
test('deleting a note cascades to its highlights')
```

- [ ] **Step 2: Verify integration tests fail**

```bash
pnpm exec tsx --test server/src/notes/highlight-persistence.test.ts
```

Expected: FAIL because persistence helpers do not exist.

- [ ] **Step 3: Implement persistence helpers**

Expose:

```ts
export interface StoredHighlight {
  id: string
  user_id: string
  note_id: string
  selected_text: string
  prefix_text: string
  suffix_text: string
  start_offset: number
  end_offset: number
  source_hash: string
}

export async function listNoteHighlights(
  client: PoolClient,
  userId: string,
  noteId: string,
): Promise<StoredHighlight[]>

export async function createNoteHighlight(
  client: PoolClient,
  input: CreateHighlightInput,
): Promise<StoredHighlight>

export async function deleteNoteHighlight(
  client: PoolClient,
  userId: string,
  noteId: string,
  highlightId: string,
): Promise<boolean>

export async function reconcileNoteHighlights(
  client: PoolClient,
  input: ReconcileHighlightsInput,
): Promise<StoredHighlight[]>
```

`reconcileNoteHighlights` must use one `BEGIN` / `COMMIT` transaction and rollback on any failure.

- [ ] **Step 4: Run persistence tests**

```bash
pnpm exec tsx --test server/src/notes/highlight-persistence.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/notes/highlight-persistence.ts \
  server/src/notes/highlight-persistence.test.ts
git commit -m "feat: 持久化并校准笔记高亮"
```

### Task 5: Extend note APIs with rendered content and highlight CRUD

**Files:**
- Modify: `server/src/notes/dto.ts`
- Modify: `server/src/notes/notes.service.ts`
- Modify: `server/src/notes/notes.controller.ts`
- Create: `server/src/notes/note-highlight-api.test.ts`

- [ ] **Step 1: Write failing service/API tests**

Add tests for:

```ts
test('getById returns rendered_content, content_hash and reconciled highlights')
test('regular note content is rendered as markdown')
test('doc content uses doc_md as the markdown source')
test('create highlight rejects a stale source hash with ConflictException')
test('create highlight validates selected text at the submitted offsets')
test('delete highlight requires matching user and note ownership')
```

- [ ] **Step 2: Verify tests fail**

```bash
pnpm exec tsx --test server/src/notes/note-highlight-api.test.ts
```

Expected: FAIL because routes and response fields do not exist.

- [ ] **Step 3: Add `CreateHighlightDto`**

```ts
export class CreateHighlightDto {
  @IsString()
  @IsNotEmpty()
  selected_text!: string

  @IsString()
  prefix_text!: string

  @IsString()
  suffix_text!: string

  @IsInt()
  @Min(0)
  start_offset!: number

  @IsInt()
  @Min(1)
  end_offset!: number

  @IsString()
  @IsNotEmpty()
  source_hash!: string
}
```

The service must additionally enforce `end_offset > start_offset` and limit selected/context text lengths:

- selected text: 1–2,000 characters.
- prefix/suffix: at most 32 characters each.

- [ ] **Step 4: Modify note detail rendering**

In `getById`:

1. Load the note with user ownership.
2. Choose Markdown source:
   - `doc_md` for `type=doc` when present.
   - otherwise `content`.
3. Call `renderNoteMarkdown`.
4. Load and resolve highlights against rendered text.
5. Reconcile changed and invalid rows.
6. Inject valid spans.
7. Return the existing fields plus:

```ts
{
  rendered_content: highlightedHtml,
  content_hash: rendered.hash,
  highlights: validHighlights.map(({ id, selected_text, start_offset, end_offset }) => ({
    id,
    selected_text,
    start_offset,
    end_offset,
  })),
}
```

- [ ] **Step 5: Add create and delete methods**

Create:

```ts
async createHighlight(uid: string, noteId: string, dto: CreateHighlightDto)
```

It must render the current note source and reject with `ConflictException` when:

- `dto.source_hash !== rendered.hash`.
- `rendered.text.slice(start, end) !== selected_text`.
- the new range overlaps a valid existing range.

Delete:

```ts
async deleteHighlight(uid: string, noteId: string, highlightId: string)
```

Return `{ id: highlightId, deleted: true }`; throw `NotFoundException` when the owned row does not exist.

- [ ] **Step 6: Add controller routes before `@Get(':id')` where needed**

```ts
@Post(':id/highlights')
@HttpCode(200)
createHighlight(...)

@Delete(':id/highlights/:highlightId')
@HttpCode(200)
deleteHighlight(...)
```

- [ ] **Step 7: Run all note backend tests**

```bash
pnpm exec tsx --test \
  server/src/notes/highlight-anchor.test.ts \
  server/src/notes/highlight-renderer.test.ts \
  server/src/notes/highlight-persistence.test.ts \
  server/src/notes/note-highlight-api.test.ts
pnpm build:server
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/notes/dto.ts \
  server/src/notes/notes.service.ts \
  server/src/notes/notes.controller.ts \
  server/src/notes/note-highlight-api.test.ts
git commit -m "feat: 新增笔记高亮接口"
```

### Task 6: Build H5 selection calculations

**Files:**
- Create: `src/pages/note-detail/selection-logic.ts`
- Create: `src/pages/note-detail/selection-logic.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing pure-function tests**

Public API:

```ts
export interface TextRange {
  startOffset: number
  endOffset: number
}

export interface SelectionAnchorPayload extends TextRange {
  selectedText: string
  prefixText: string
  suffixText: string
}

export function buildSelectionAnchor(
  fullText: string,
  startOffset: number,
  endOffset: number,
): SelectionAnchorPayload | null

export function overlapsAny(
  range: TextRange,
  highlights: TextRange[],
): boolean

export function clampToolbarPosition(input: {
  selectionLeft: number
  selectionTop: number
  selectionBottom: number
  toolbarWidth: number
  toolbarHeight: number
  viewportWidth: number
  viewportHeight: number
  margin?: number
}): { left: number; top: number }
```

Tests:

```ts
test('builds selected text and 32-character context')
test('trims an all-whitespace selection to null')
test('preserves exact offsets for meaningful surrounding whitespace')
test('rejects an overlapping range but allows touching ranges')
test('centers toolbar above selection')
test('moves toolbar below selection when there is no top space')
test('clamps toolbar inside viewport margins')
```

- [ ] **Step 2: Verify RED**

```bash
pnpm exec tsx --test src/pages/note-detail/selection-logic.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure helpers**

Use a fixed 32-character context. Do not access `window`, `document`, or DOM APIs in this file so the tests run in Node.

- [ ] **Step 4: Add a test script**

Add to root `package.json`:

```json
"test:note-highlights": "tsx --test server/src/notes/highlight-migration.test.ts server/src/notes/highlight-anchor.test.ts server/src/notes/highlight-renderer.test.ts server/src/notes/highlight-persistence.test.ts server/src/notes/note-highlight-api.test.ts src/pages/note-detail/selection-logic.test.ts"
```

- [ ] **Step 5: Run tests**

```bash
pnpm test:note-highlights
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/note-detail/selection-logic.ts \
  src/pages/note-detail/selection-logic.test.ts \
  package.json
git commit -m "feat: 计算笔记正文选区"
```

### Task 7: Build the H5 selection toolbar

**Files:**
- Create: `src/components/note-selection-toolbar.tsx`
- Modify: `src/pages/note-detail/index.tsx`

- [ ] **Step 1: Create the toolbar using project UI components**

Use:

```ts
import { Button } from '@/components/ui/button'
import { Copy, Highlighter, Trash2 } from 'lucide-react-taro'
```

Props:

```ts
interface NoteSelectionToolbarProps {
  mode: 'selection' | 'highlight'
  left: number
  top: number
  busy?: boolean
  onHighlight?: () => void
  onCopy: () => void
  onRemove?: () => void
}
```

The outer container is a custom floating surface, but action controls must use `Button`. Because this is fixed + flex on H5, use the project-required inline compatibility style:

```tsx
<View
  style={{
    position: 'fixed',
    left,
    top,
    display: 'flex',
    flexDirection: 'row',
    zIndex: 200,
  }}
>
```

Visual requirements:

- Dark neutral background.
- Rounded large corners.
- Two compact icon-plus-label actions.
- Small downward pointer.
- Selection mode: “高亮 / 复制”.
- Existing-highlight mode: “取消高亮 / 复制”.

- [ ] **Step 2: Add H5 DOM selection helpers inside the page**

Use a `useEffect` gated by `IS_H5_ENV` to register:

- `selectionchange`
- `mouseup`
- `touchend`
- scroll listener on the page container

When selection ends:

1. Read `window.getSelection()`.
2. Require exactly one non-collapsed range.
3. Confirm `mdContentRef.current.contains(range.commonAncestorContainer)`.
4. Compute start/end offsets by creating a range from the content root to selection boundaries and reading `toString().length`.
5. Build context through `buildSelectionAnchor`.
6. Reject overlap through `overlapsAny`.
7. Position the toolbar from `range.getBoundingClientRect()`.

Cleanup every listener on unmount.

- [ ] **Step 3: Add create/copy/remove actions**

Create:

```ts
await Network.request({
  url: `/api/notes/${note.id}/highlights`,
  method: 'POST',
  data: {
    selected_text: selection.selectedText,
    prefix_text: selection.prefixText,
    suffix_text: selection.suffixText,
    start_offset: selection.startOffset,
    end_offset: selection.endOffset,
    source_hash: note.content_hash,
  },
})
```

Copy:

```ts
await Taro.setClipboardData({ data: selectedText })
```

Remove:

```ts
await Network.request({
  url: `/api/notes/${note.id}/highlights/${highlightId}`,
  method: 'DELETE',
})
```

On success, call `loadNote(note.id)` to use the server as the source of truth.

On HTTP 409, show “正文已更新，请重新选择” and reload.

- [ ] **Step 4: Add event delegation for existing highlights**

Attach one H5 click listener to `mdContentRef.current`. Walk from `event.target` to the nearest:

```css
[data-highlight-id]
```

Read the ID and text content, find the matching returned highlight, and open the toolbar in `highlight` mode.

- [ ] **Step 5: Render server HTML on H5**

Replace use of `note.content` with `note.rendered_content`.

Keep `innerHTML` assignment confined to H5 and only use server-sanitized HTML.

- [ ] **Step 6: Verify H5 manually**

Run:

```bash
pnpm dev
```

At the current note detail route verify:

1. `##` and `**` render as headings and bold text.
2. Mouse selection opens the toolbar.
3. Copy places exact selected text on clipboard.
4. Highlight survives refresh.
5. Clicking yellow text exposes cancel.
6. Cancel survives refresh.
7. Selection outside the body does not open the toolbar.

- [ ] **Step 7: Commit**

```bash
git add src/components/note-selection-toolbar.tsx \
  src/pages/note-detail/index.tsx
git commit -m "feat: 新增笔记选区高亮工具栏"
```

### Task 8: Add WeChat Markdown and saved-highlight rendering

**Files:**
- Modify: `src/pages/note-detail/index.tsx`
- Modify: `src/app.css`

- [ ] **Step 1: Replace the WeChat plain-text fallback**

Import `RichText` from `@tarojs/components` and render:

```tsx
<RichText
  nodes={note.rendered_content}
  userSelect
  selectable
  className="md-content"
/>
```

Do not attach the custom selection toolbar on non-H5 environments.

- [ ] **Step 2: Refine reading typography**

Update `.md-content` to:

- Use comfortable `1.75` paragraph line height.
- Increase heading spacing.
- Preserve list indentation.
- Allow tables and code blocks to scroll horizontally.
- Style `[data-highlight-id]` with the same yellow background used by the server.
- Keep `user-select: text` on H5.

Only use CSS for injected HTML selectors, which cannot be expressed with page Tailwind classes.

- [ ] **Step 3: Build H5 and WeChat**

```bash
pnpm build:web
pnpm build:weapp
```

Expected: both exit 0.

- [ ] **Step 4: Verify in WeChat Developer Tools**

Verify:

1. Markdown headings, bold text, lists, quotes, code, and tables render.
2. H5-created yellow highlights are visible.
3. Long press invokes the native text selection/copy menu.
4. No H5 custom toolbar is rendered.

- [ ] **Step 5: Commit**

```bash
git add src/pages/note-detail/index.tsx src/app.css
git commit -m "feat: 支持微信端Markdown阅读"
```

### Task 9: Verify edit reconciliation and finish documentation

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/STATE_MACHINE.md` only if note behavior is documented there

- [ ] **Step 1: Add an end-to-end reconciliation test**

Extend `server/src/notes/note-highlight-api.test.ts`:

```ts
test('preserves a highlight after text is inserted before it')
test('deletes a highlight when its quote no longer exists')
test('deletes a highlight when repeated candidates are ambiguous')
```

- [ ] **Step 2: Run the focused suite**

```bash
pnpm test:note-highlights
pnpm test:note-editor
pnpm test:prelaunch
```

Expected: all PASS.

- [ ] **Step 3: Run static checks and required builds**

```bash
pnpm validate
pnpm build:server
pnpm build:web
pnpm build:weapp
```

Expected: all exit 0. The feature acceptance scope does not include Douyin Mini Program.

- [ ] **Step 4: Perform database-backed manual acceptance**

With a test account:

1. Open a Markdown-heavy note.
2. Create two non-overlapping highlights.
3. Refresh and sign out/in; both remain.
4. Edit the document by inserting text before highlight one; reopen and confirm it moved.
5. Edit away highlight two’s selected sentence; reopen and confirm it disappeared.
6. Confirm database rows match the final rendered state.

- [ ] **Step 5: Update ROADMAP**

Document:

- Markdown detail rendering complete.
- H5 permanent highlight/create/copy/cancel complete.
- WeChat Markdown, existing highlight, and native copy complete.
- WeChat custom highlight creation intentionally deferred due missing reliable selection range API.
- Douyin Mini Program excluded from this feature.

- [ ] **Step 6: Final diff review**

```bash
git diff --check
git status --short
```

Confirm build outputs and local files such as `.agents/`, `.codex/`, `docs/superpowers/` files unrelated to this plan, and `project.private.config.json` are not staged.

- [ ] **Step 7: Commit**

```bash
git add docs/ROADMAP.md \
  server/src/notes/note-highlight-api.test.ts
git commit -m "test: 验证笔记高亮重定位"
```

## Completion Criteria

- Markdown syntax is rendered, not displayed as source, for normal notes and MD documents.
- H5 selection toolbar supports yellow highlight and copy.
- Existing H5 highlights support cancel and copy.
- Highlights persist across refresh and login sessions.
- Edit reconciliation preserves uniquely matched quotes and deletes invalid or ambiguous quotes.
- Overlapping highlights are rejected.
- WeChat renders Markdown and saved highlights and supports native copy.
- No custom selection toolbar code runs in WeChat.
- H5, WeChat, server builds and all focused tests pass.
