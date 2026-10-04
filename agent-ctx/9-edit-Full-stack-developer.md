# Task 9 — Edit PDF Builder

Agent: Full-stack-developer (Edit PDF builder) — Z.ai Code
Task ID: 9-edit
Started from: worklog.md (Tasks 1-11 complete — site is live, sidebar + dashboard + 20+ tool components wired into `registry.tsx`).

## What I built

**2 files touched** (1 new tool component + 1 registry edit):

### `src/components/tools/tools/edit-pdf.tsx` (new, ~430 lines)
`EditPdfTool` React component (`"use client"`). UX flow:
1. **Pick PDF** — `FileDropzone` (accept=`application/pdf`, single file).
2. **Choose page** — `<Select>` of page numbers 1..N (page count obtained by loading the PDF client-side via `loadPdf` and reading `doc.getPageCount()`).
3. **Add text annotations** — full annotation editor:
   - `<Textarea>` for the annotation text (multi-line supported; on save each line is drawn separately, descending by `size * 1.2` line height).
   - Font-size `<Slider>` (8–72pt, default 14pt).
   - Color picker: native `<input type="color">` + hex `<Input>` (default `#eab308` brand yellow).
   - Font-family `<Select>` (Helvetica / Helvetica Bold / Times Roman / Courier — all available via `StandardFonts`).
   - Position: two `<Input type="number">` for X and Y in PDF points (range-checked `0..pageWidth`/`0..pageHeight`), plus 5 preset buttons (Top-left, Top-right, Center, Bottom-left, Bottom-right) that compute proper geometric positions using `font.widthOfTextAtSize(text, size)` for accurate centering.
   - "Add annotation to page N" button → appends `{ id, text, x, y, size, color, font, page }` to the list (id from `uid()`).
   - Annotation list rendered as removable chips inside a `max-h-96 overflow-y-auto` scroll container with custom spacing — each chip shows a color swatch, truncated text, page/size/font/coords metadata, and a Trash button.
4. **Apply & download** — "Save edited PDF" button:
   - Reloads the original PDF bytes via `loadPdf(bytes)` (so repeated saves don't accumulate annotations on the same doc).
   - Embeds only the fonts actually used by the annotation set (deduplicated via `Set<FontId>`) via `doc.embedFont(StandardFonts.X)`.
   - For each annotation: `pages[ann.page - 1].drawText(line, { x, y: ann.y - i * lineH, size, font, color: rgb(r,g,b), rotate: degrees(0) })` — `hexToRgb` converts hex to 0–1 floats.
   - `savePdf(doc)` → `pdfBlob(outBytes)` → `URL.createObjectURL` → sets `status="done"`, `resultUrl`, `resultName="edited.pdf"`, `resultSize` on `ToolShell` (built-in download UI handles the rest).
   - Calls `useAppStore.getState().addRecent({ name: "edited.pdf", toolId: "edit-pdf", size: outBytes.length })`.
   - Success toast via `sonner`.
- **Honest limitation note** rendered as a yellow info box: "This tool adds new text on top of existing pages. To edit existing text in a PDF, use the AI Chat or AI Summarize tools to extract and work with the text."
- The standard privacy note ("Your file is processed entirely in your browser…") is rendered by `ToolShell` itself.
- Two refs are used: `fileBytesRef` (original `Uint8Array` for save-time reload) and `previewFontsRef` (font instances from a one-shot `loadPdf` at file-pick time, used for preset width measurements — they're not used for saving).

### `src/components/tools/registry.tsx` (1-line edit)
- Added `import { EditPdfTool } from "./tools/edit-pdf";` after the `merge-pdf` import.
- Added `"edit-pdf": EditPdfTool,` to the `TOOL_COMPONENTS` map right after `"merge-pdf"`.
- Did NOT change anything else in the file.

## Verification

- `bun run lint` → 0 errors, 0 warnings in my files (the only project-wide warning is in `sign-pdf.tsx`, which I did NOT touch).
- `bunx eslint src/components/tools/tools/edit-pdf.tsx src/components/tools/registry.tsx` → exit 0, no output.
- `bunx tsc --noEmit` → 0 errors in my files (pre-existing errors in `examples/`, `skills/`, and `dashboard-view.tsx` are out of scope).
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → **200** (dev server is running on port 3000; response time ~11s on first hit because Turbopack recompiled after my edits — subsequent hits are sub-second).

## Constraints respected

- Did NOT touch any file in the off-limits list: `tool-shell.tsx`, `file-dropzone.tsx`, `src/lib/tools.ts`, `src/lib/store.ts`, `src/lib/pdf/client-pdf.ts`, `src/lib/pdf/extract-text.ts`, `src/lib/format.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`.
- Only edits to `src/components/tools/` were: creating `tools/edit-pdf.tsx` and adding 1 import + 1 map entry to `registry.tsx`.
- No new npm packages installed — reused the existing pdf-lib wrapper at `@/lib/pdf/client-pdf` for `loadPdf`, `savePdf`, `pdfBlob`, `embedStandardFont` semantics (used `doc.embedFont(StandardFonts.X)` directly), `rgb`, `degrees`, `StandardFonts`, and the re-exported `PDFFont` type.
- All shadcn/ui components used (`Button`, `Input`, `Label`, `Textarea`, `Slider`, `Select` family) are pre-installed in `src/components/ui/`.
- Mobile-friendly responsive layout (`sm:grid-cols-2`, `flex-wrap` on preset buttons, `max-h-96 overflow-y-auto` on the annotation list).
- Accessibility: all form controls have associated `<Label htmlFor>`; preset buttons have text labels; Trash buttons have `aria-label`; color swatch has `aria-hidden`; X/Y inputs have `sr-only` labels.
- `"use client"` directive on the component (no SSR mismatch — all state is client-side; `ToolShell` is also client-only).
EOF
