// Tools catalog for YellowPDF.
// Every tool is grouped into exactly one category. Tools are plain data — the
// actual tool UI components live in `src/components/tools/*` and are wired up
// by Task 4.

import {
  FileText,
  PenLine,
  Combine,
  Minimize2,
  Scissors,
  FileType2,
  Image as ImageIcon,
  ScanLine,
  RotateCw,
  Trash2,
  FileStack,
  Crop,
  Stamp,
  Lock,
  Unlock,
  FileImage,
  FileType,
  FileSpreadsheet,
  Presentation,
  Code2,
  FileJson,
  Languages,
  Sparkles,
  MessageSquareText,
  ListChecks,
  FileSignature,
  SquareStack,
  BookOpen,
  Share2,
  Building2,
  Workflow,
  FilePlus2,
  FileOutput,
  ShieldCheck,
  ScanText,
  Hash,
  Wand2,
  FileInput,
  BadgeCheck,
  FileCheck2,
  Eraser,
  Brush,
  LayoutTemplate,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";

export type ToolId =
  | "edit-pdf"
  | "sign-pdf"
  | "merge-pdf"
  | "compress-pdf"
  | "split-pdf"
  | "pdf-to-word"
  | "images-to-pdf"
  | "scan-document"
  | "rotate-pdf"
  | "delete-pages"
  | "reorder-pages"
  | "crop-pages"
  | "watermark-pdf"
  | "protect-pdf"
  | "unlock-pdf"
  | "pdf-to-images"
  | "pdf-to-html"
  | "word-to-pdf"
  | "excel-to-pdf"
  | "ppt-to-pdf"
  | "html-to-pdf"
  | "json-to-pdf"
  | "ai-summarize"
  | "ai-translate"
  | "ai-chat"
  | "ai-keypoints"
  | "ocr-pdf"
  | "organize-pages"
  | "number-pages"
  | "pdf-to-a4"
  | "repair-pdf"
  | "stamp"
  | "fill-form"
  | "pdf-to-excel"
  | "pdf-to-ppt"
  | "redact-pdf"
  | "sanitize-pdf"
  | "verify-pdf"
  | "templates"
  | "share-pdf"
  | "review-pdf"
  | "blog"
  | "about";

export type ToolCategory =
  | "scan-workflow"
  | "page-management"
  | "edit-annotate"
  | "create-convert-pdf"
  | "convert-other"
  | "security-privacy"
  | "ai-tools"
  | "business"
  | "collaborate-share";

export type ToolInput = "pdf" | "pdfs" | "images" | "text" | "none";

export type ToolBadge = "new" | "popular" | "ai" | "beta";

export interface Tool {
  id: ToolId;
  title: string;
  description: string;
  icon: LucideIcon;
  category: ToolCategory;
  badge?: ToolBadge;
  inputs: ToolInput[];
  /** HTML `accept` attribute for the file input. */
  acceptType?: string;
  /** Minimum number of files required (e.g. merge needs 2+). */
  minFiles?: number;
}

export interface CategoryMeta {
  id: ToolCategory;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: "scan-workflow",
    label: "Scan & OCR",
    icon: Workflow,
    description: "Capture paper documents and extract text from scans.",
  },
  {
    id: "page-management",
    label: "Page Management",
    icon: SquareStack,
    description: "Reorder, split, rotate, and reshape pages inside your PDFs.",
  },
  {
    id: "edit-annotate",
    label: "Edit & Annotate",
    icon: PenLine,
    description: "Add signatures, watermarks, stamps, and form fields.",
  },
  {
    id: "create-convert-pdf",
    label: "Create PDF",
    icon: FilePlus2,
    description: "Build new PDFs from Word, Excel, PowerPoint, HTML, or images.",
  },
  {
    id: "convert-other",
    label: "Convert from PDF",
    icon: FileOutput,
    description: "Export PDF content into Word, Excel, images, and HTML.",
  },
  {
    id: "security-privacy",
    label: "Security & Privacy",
    icon: ShieldCheck,
    description: "Encrypt, decrypt, redact, and sanitize sensitive PDFs.",
  },
  {
    id: "ai-tools",
    label: "AI Tools",
    icon: Sparkles,
    description: "Summarize, translate, chat, and extract key points with AI.",
  },
  {
    id: "business",
    label: "Business",
    icon: Building2,
    description: "Templates, blog, and company info for document workflows.",
  },
  {
    id: "collaborate-share",
    label: "Collaborate & Share",
    icon: Share2,
    description: "Share PDFs with links and request reviews from others.",
  },
];

export const TOOLS: Tool[] = [
  // ── scan-workflow ────────────────────────────────────────────────────────
  {
    id: "scan-document",
    title: "Scan Document",
    description:
      "Capture paper documents with your camera and save as a searchable PDF.",
    icon: ScanLine,
    category: "scan-workflow",
    badge: "new",
    inputs: ["none"],
  },
  {
    id: "ocr-pdf",
    title: "OCR PDF",
    description:
      "Recognize text in scanned PDFs and images so you can search, copy, and edit.",
    icon: ScanText,
    category: "scan-workflow",
    badge: "ai",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },

  // ── page-management ──────────────────────────────────────────────────────
  {
    id: "merge-pdf",
    title: "Merge PDF",
    description:
      "Combine multiple PDFs into one document in your chosen order.",
    icon: Combine,
    category: "page-management",
    badge: "popular",
    inputs: ["pdfs"],
    acceptType: "application/pdf",
    minFiles: 2,
  },
  {
    id: "split-pdf",
    title: "Split PDF",
    description:
      "Extract pages or split a PDF into multiple smaller files by range.",
    icon: Scissors,
    category: "page-management",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "rotate-pdf",
    title: "Rotate PDF",
    description:
      "Rotate every page or selected pages of a PDF to the correct orientation.",
    icon: RotateCw,
    category: "page-management",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "delete-pages",
    title: "Delete Pages",
    description: "Remove unwanted pages from a PDF and save the trimmed result.",
    icon: Trash2,
    category: "page-management",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "reorder-pages",
    title: "Reorder Pages",
    description:
      "Drag and drop pages into a new order and save the rearranged PDF.",
    icon: FileStack,
    category: "page-management",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "organize-pages",
    title: "Organize Pages",
    description:
      "Visual page organizer: rotate, delete, reorder, and insert pages in one place.",
    icon: SquareStack,
    category: "page-management",
    badge: "popular",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "crop-pages",
    title: "Crop Pages",
    description:
      "Crop margins or trim the visible area of individual pages of a PDF.",
    icon: Crop,
    category: "page-management",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "number-pages",
    title: "Number Pages",
    description:
      "Add automatic page numbers (footer, header, or Bates) to every page.",
    icon: Hash,
    category: "page-management",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "pdf-to-a4",
    title: "PDF to A4",
    description: "Resize every page to A4 format so the document prints cleanly.",
    icon: FileText,
    category: "page-management",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "repair-pdf",
    title: "Repair PDF",
    description:
      "Recover text and pages from a damaged or corrupted PDF file.",
    icon: Wand2,
    category: "page-management",
    badge: "beta",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },

  // ── edit-annotate ────────────────────────────────────────────────────────
  {
    id: "edit-pdf",
    title: "Edit PDF",
    description:
      "Add text, shapes, and drawings directly on top of any PDF page.",
    icon: PenLine,
    category: "edit-annotate",
    badge: "popular",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "sign-pdf",
    title: "Sign PDF",
    description:
      "Draw or type your signature and place it on any page of a PDF.",
    icon: FileSignature,
    category: "edit-annotate",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "watermark-pdf",
    title: "Watermark PDF",
    description:
      "Add a text or image watermark across one or all pages of a PDF.",
    icon: Stamp,
    category: "edit-annotate",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "stamp",
    title: "Stamp PDF",
    description:
      "Apply rubber-stamp markings (Approved, Draft, Confidential) to pages.",
    icon: BadgeCheck,
    category: "edit-annotate",
    badge: "new",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "fill-form",
    title: "Fill Form",
    description:
      "Fill in fillable PDF forms and save the completed document.",
    icon: FileInput,
    category: "edit-annotate",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },

  // ── create-convert-pdf ──────────────────────────────────────────────────
  {
    id: "word-to-pdf",
    title: "Word to PDF",
    description: "Convert DOC and DOCX files into clean, print-ready PDFs.",
    icon: FileType,
    category: "create-convert-pdf",
    inputs: ["none"],
    acceptType:
      ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    id: "excel-to-pdf",
    title: "Excel to PDF",
    description: "Turn XLS and XLSX spreadsheets into paginated, print-ready PDFs.",
    icon: FileSpreadsheet,
    category: "create-convert-pdf",
    inputs: ["none"],
    acceptType:
      ".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    id: "ppt-to-pdf",
    title: "PowerPoint to PDF",
    description: "Convert PPT and PPTX slides into a single PDF document.",
    icon: Presentation,
    category: "create-convert-pdf",
    inputs: ["none"],
    acceptType:
      ".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  {
    id: "html-to-pdf",
    title: "HTML to PDF",
    description: "Render an HTML file or live URL into a polished PDF.",
    icon: Code2,
    category: "create-convert-pdf",
    inputs: ["none", "text"],
    acceptType: ".html,.htm,text/html",
  },
  {
    id: "json-to-pdf",
    title: "JSON to PDF",
    description: "Format JSON data into structured, readable PDF reports.",
    icon: FileJson,
    category: "create-convert-pdf",
    inputs: ["none"],
    acceptType: ".json,application/json",
  },
  {
    id: "images-to-pdf",
    title: "Images to PDF",
    description:
      "Combine JPG, PNG, and other images into a single PDF document.",
    icon: ImageIcon,
    category: "create-convert-pdf",
    badge: "popular",
    inputs: ["images"],
    acceptType: "image/*",
    minFiles: 1,
  },
  {
    id: "compress-pdf",
    title: "Compress PDF",
    description: "Reduce PDF file size while keeping good visual quality.",
    icon: Minimize2,
    category: "create-convert-pdf",
    badge: "popular",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },

  // ── convert-other ───────────────────────────────────────────────────────
  {
    id: "pdf-to-word",
    title: "PDF to Word",
    description: "Convert a PDF into an editable DOCX document.",
    icon: FileType2,
    category: "convert-other",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "pdf-to-excel",
    title: "PDF to Excel",
    description: "Extract tables from a PDF into editable XLSX spreadsheets.",
    icon: FileSpreadsheet,
    category: "convert-other",
    badge: "beta",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "pdf-to-ppt",
    title: "PDF to PowerPoint",
    description: "Convert each PDF page into an editable PowerPoint slide.",
    icon: Presentation,
    category: "convert-other",
    badge: "beta",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "pdf-to-images",
    title: "PDF to Images",
    description: "Export each PDF page as a PNG, JPG, or TIFF image.",
    icon: FileImage,
    category: "convert-other",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "pdf-to-html",
    title: "PDF to HTML",
    description: "Convert PDF content into clean, web-ready HTML.",
    icon: Code2,
    category: "convert-other",
    badge: "beta",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },

  // ── security-privacy ────────────────────────────────────────────────────
  {
    id: "protect-pdf",
    title: "Protect PDF",
    description:
      "Add a password and AES encryption to keep your PDF private.",
    icon: Lock,
    category: "security-privacy",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "unlock-pdf",
    title: "Unlock PDF",
    description:
      "Remove the password from a PDF you have the right to access.",
    icon: Unlock,
    category: "security-privacy",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "redact-pdf",
    title: "Redact PDF",
    description:
      "Black out sensitive text or regions permanently before sharing.",
    icon: Eraser,
    category: "security-privacy",
    badge: "new",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "sanitize-pdf",
    title: "Sanitize PDF",
    description:
      "Strip metadata, hidden layers, and scripts to ship a clean PDF.",
    icon: Brush,
    category: "security-privacy",
    badge: "new",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "verify-pdf",
    title: "Verify PDF",
    description:
      "Check digital signatures and certificate validity in a PDF.",
    icon: FileCheck2,
    category: "security-privacy",
    badge: "beta",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },

  // ── ai-tools ────────────────────────────────────────────────────────────
  {
    id: "ai-summarize",
    title: "AI Summarize",
    description: "Generate a concise summary of any PDF using AI.",
    icon: Sparkles,
    category: "ai-tools",
    badge: "ai",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "ai-translate",
    title: "AI Translate",
    description:
      "Translate the text of a PDF into 30+ languages while keeping layout.",
    icon: Languages,
    category: "ai-tools",
    badge: "ai",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "ai-chat",
    title: "AI Chat",
    description: "Chat with your PDF: ask questions and get cited answers.",
    icon: MessageSquareText,
    category: "ai-tools",
    badge: "ai",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "ai-keypoints",
    title: "AI Key Points",
    description:
      "Extract the most important bullet points from a long PDF.",
    icon: ListChecks,
    category: "ai-tools",
    badge: "ai",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },

  // ── business ─────────────────────────────────────────────────────────────
  {
    id: "blog",
    title: "Blog",
    description: "Tips, tutorials, and product updates from the YellowPDF team.",
    icon: BookOpen,
    category: "business",
    inputs: ["none"],
  },
  {
    id: "about",
    title: "About Us",
    description: "Learn about YellowPDF's mission, team, and roadmap.",
    icon: Building2,
    category: "business",
    inputs: ["none"],
  },
  {
    id: "templates",
    title: "Templates",
    description: "Ready-made PDF templates for invoices, contracts, and resumes.",
    icon: LayoutTemplate,
    category: "business",
    badge: "new",
    inputs: ["none"],
  },

  // ── collaborate-share ────────────────────────────────────────────────────
  {
    id: "share-pdf",
    title: "Share PDF",
    description:
      "Get a shareable link to send a PDF to anyone, no attachment needed.",
    icon: Share2,
    category: "collaborate-share",
    badge: "beta",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
  {
    id: "review-pdf",
    title: "Review PDF",
    description:
      "Request comments and approvals from teammates on a PDF.",
    icon: MessagesSquare,
    category: "collaborate-share",
    badge: "beta",
    inputs: ["pdf"],
    acceptType: "application/pdf",
  },
];

/** Flat alias for TOOLS — handy for searches & iteration. */
export const ALL_TOOLS: Tool[] = TOOLS;

/** Quick lookup map for tool metadata by id. */
export function getToolById(id: ToolId): Tool | undefined {
  return ALL_TOOLS.find((t) => t.id === id);
}

/** Return all tools for a given category, in catalog order. */
export function getToolsByCategory(catId: ToolCategory): Tool[] {
  return ALL_TOOLS.filter((t) => t.category === catId);
}

/** Category metadata lookup. */
export function getCategoryById(
  catId: ToolCategory,
): CategoryMeta | undefined {
  return CATEGORIES.find((c) => c.id === catId);
}

/** Per-tool extra synonyms that don't appear in the title/description. */
const SEARCH_SYNONYMS: Partial<Record<ToolId, string>> = {
  "merge-pdf": "join combine concatenate append unite",
  "split-pdf": "extract divide separate cut break",
  "rotate-pdf": "flip turn orient portrait landscape",
  "delete-pages": "remove drop page erase",
  "reorder-pages": "rearrange sort move shuffle",
  "organize-pages": "thumbnail grid arrange manage",
  "crop-pages": "trim margin clip",
  "number-pages": "bates paginate numbering footer header",
  "pdf-to-a4": "resize a4 paper letter print fit",
  "repair-pdf": "fix recover restore corrupt broken",
  "edit-pdf": "modify add text annotate draw",
  "sign-pdf": "signature initial autograph esign",
  "watermark-pdf": "overlay logo stamp translucent",
  stamp: "approved draft confidential rubber",
  "fill-form": "form fields fillable acroform",
  "word-to-pdf": "doc docx microsoft office",
  "excel-to-pdf": "xls xlsx spreadsheet",
  "ppt-to-pdf": "ppt pptx powerpoint slide",
  "html-to-pdf": "web page url link render",
  "json-to-pdf": "data report api",
  "images-to-pdf": "jpg jpeg png tiff gif picture photo",
  "compress-pdf": "reduce shrink optimize size smaller",
  "pdf-to-word": "docx editable text",
  "pdf-to-excel": "xlsx spreadsheet table",
  "pdf-to-ppt": "pptx powerpoint slide",
  "pdf-to-images": "jpg png tiff picture photo export",
  "pdf-to-html": "web page",
  "protect-pdf": "encrypt password secure aes",
  "unlock-pdf": "decrypt remove password unsecure",
  "redact-pdf": "blackout hide censor mask",
  "sanitize-pdf": "clean metadata remove hidden",
  "verify-pdf": "validate certificate signature check",
  "ai-summarize": "summary tldr short",
  "ai-translate": "translation language localize",
  "ai-chat": "question answer assistant bot ask",
  "ai-keypoints": "bullets highlights important",
  "ocr-pdf": "text recognition scanned image",
  "scan-document": "camera capture paper",
  blog: "news articles posts",
  about: "company mission team",
  templates: "invoice contract resume sample",
  "share-pdf": "link send email",
  "review-pdf": "comment approve feedback",
};

/**
 * Search index for fuzzy / substring matching. Each entry pairs the tool with a
 * lowercase blob of keywords (title + description + curated synonyms).
 */
export const SEARCH_INDEX: Array<{ tool: Tool; keywords: string }> =
  ALL_TOOLS.map((tool) => {
    const base = `${tool.title} ${tool.description}`;
    const extra = SEARCH_SYNONYMS[tool.id] ?? "";
    return { tool, keywords: `${base} ${extra}`.toLowerCase() };
  });

/**
 * Run a fuzzy search across the catalog. Returns matching tools ranked by how
 * many of the user's query terms appear in their keyword blob.
 */
export function searchTools(query: string, limit = 20): Tool[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const scored = SEARCH_INDEX.map(({ tool, keywords }) => {
    let score = 0;
    for (const term of terms) {
      if (keywords.includes(term)) score += 1;
      // Bonus: title starts with the term.
      if (tool.title.toLowerCase().includes(term)) score += 0.5;
    }
    return { tool, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.tool);
  return scored;
}
