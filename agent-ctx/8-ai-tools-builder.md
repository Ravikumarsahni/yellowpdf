# Task 8 — AI Tools Builder

Agent: AI Tools Builder (Z.ai Code)
Task ID: 8
Started from: worklog.md (Tasks 1-3 complete + Tasks 4-7 wiring present in the codebase).

## What I built

**9 files** — all in scope (4 API routes + 1 lib helper + 4 AI tool components):

### Backend API routes (`src/app/api/ai/*/route.ts`)
- `src/app/api/ai/summarize/route.ts` — POST `{ text, length? }` → `{ summary }`
- `src/app/api/ai/translate/route.ts` — POST `{ text, target }` → `{ translation, target }`
- `src/app/api/ai/chat/route.ts` — POST `{ text, question, history? }` → `{ answer }`
- `src/app/api/ai/keypoints/route.ts` — POST `{ text, maxPoints? }` → `{ points }`

All 4 use:
- `runtime = "nodejs"`, `dynamic = "force-dynamic"`
- `import ZAI from "z-ai-web-dev-sdk"` + `await ZAI.create()` + `zai.chat.completions.create({ messages, thinking: { type: "disabled" } })`
- `role: "system"` for system prompts (verified via end-to-end curl tests against the upstream Z-AI API)
- Text truncated to 30_000 chars
- `db.usageEvent.create(...)` wrapped in `try/catch` so DB issues never break the API
- Console logs for request size + duration on success and failure

### Client-side PDF text extraction (`src/lib/pdf/extract-text.ts`)
- `extractTextFromPdf(data: Uint8Array): Promise<{ text: string; pages: number }>`
- Worker wired from CDN: `pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@" + pdfjsLib.version + "/build/pdf.worker.min.mjs"`
- Per-page text joined with `--- Page N ---` markers, separated by `\n\n`
- Resources released via `page.cleanup()` + `doc.cleanup()` + `loadingTask.destroy()` in `finally` blocks

### AI tool UI components (`src/components/tools/tools/ai-*.tsx`)
Each overwrote the `ComingSoonTool` stub. Common pattern:
- `"use client"`, `ToolShell` for layout, `FileDropzone` (accept=`application/pdf`, multiple=false)
- "Extracting text from PDF…" loading state via `extractTextFromPdf`
- File metadata box (name + size + page count + char count)
- Tool-specific controls → POST to corresponding `/api/ai/*` route via `fetch`
- Result rendered in styled `Card` with "Copy" button (`navigator.clipboard.writeText` + 1.8s "Copied" feedback)
- AI-specific privacy note: "Only the extracted text is sent to our AI backend — your PDF file never leaves your device."
- `addRecent(...)` recorded after a successful result

Tool-specifics:
- `AiSummarizeTool` — `RadioGroup` of 3 length cards (Short/Medium/Long), summary split into paragraphs.
- `AiTranslateTool` — `<Select>` with 12 languages; amber notice that PDF layout won't be preserved (text-only translation).
- `AiChatTool` — chat bubbles (user right, assistant left), `react-markdown` for assistant answers, `Textarea` + Send button, ⌘/Ctrl+Enter keyboard shortcut, scrollable container with auto-scroll on new messages, 4 starter-question chips.
- `AiKeypointsTool` — `<Slider>` 3-15 (default 8) with live tabular-nums readout, markdown bullets via `react-markdown`.

## Verification

- `bunx eslint` on my 9 files → exit 0, no output.
- `bunx tsc --noEmit` on my 9 files → 0 errors.
- `curl http://localhost:3000/` → **200**.
- End-to-end API tests (all 4 routes hit with `curl -X POST`):
  - `/api/ai/summarize` → 200, 268-char summary in 1.3s
  - `/api/ai/translate` (target=Spanish) → 200, 182-char translation in 0.7s
  - `/api/ai/chat` (single question) → 200, 283-char answer that quoted the document in 1.3s
  - `/api/ai/keypoints` (maxPoints=5) → 200, 5 markdown bullets in 0.9s
  - Validation: `{}` body → 400 "text is required"
- Prisma `UsageEvent` INSERTs confirmed in dev.log for every successful API call.

## Constraints respected

- No new npm packages installed.
- Did NOT touch: `@/lib/pdf/client-pdf.ts`, `@/components/tools/tool-shell.tsx`, `@/components/tools/file-dropzone.tsx`, `@/components/tools/registry.tsx`, `@/components/tools/placeholder-tools.tsx`, `@/lib/tools.ts`, `@/lib/store.ts`.
- `z-ai-web-dev-sdk` imported only in API routes (server-side).
- `"use client"` on all 4 tool components; API routes use `runtime = "nodejs"` (no `"use server"`).

## Workarounds

- **SKILL.md vs. SDK types on `role` for system prompts**: SKILL.md recommends `role: "assistant"` for system prompts (a tested workaround), but the SDK's TypeScript type explicitly supports `role: 'system' | 'user' | 'assistant'`. Used `role: "system"` (semantically correct OpenAI convention); verified end-to-end via curl tests against the upstream Z-AI API. If a future SDK/provider change rejects `system`, swapping to `assistant` is a 4-character find-and-replace across the 4 route files.
- **Transient `GET / 500` in dev.log**: Turbopack briefly reported a broken `import { cn, formatBytes } from "@/lib/utils"` in `file-dropzone.tsx` (the file actually imports from `@/lib/format` correctly). I did NOT modify `file-dropzone.tsx` (off-limits per spec). The 500 resolved itself once Turbopack's incremental cache caught up — homepage now returns 200 consistently.

## Notes for downstream agents

- The 4 AI tool components are now real implementations — when a user opens the AI Summarize / AI Translate / AI Chat / AI Key Points tool from the dashboard or sidebar, they'll see the full UI.
- `UsageEvent` rows are being written to the SQLite DB on every successful (and failed) AI API call. Downstream dashboard "trending tools" or "usage stats" features can read this table.
- The `extractTextFromPdf` helper at `src/lib/pdf/extract-text.ts` is the canonical client-side PDF text extraction entry point — any future AI tool (e.g. AI Q&A from images, OCR fallback) should reuse it.
EOF
