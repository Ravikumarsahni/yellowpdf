"use client";

import { useAppStore } from "@/lib/store";
import { getToolById } from "@/lib/tools";
import { ComingSoonTool } from "./placeholder-tools";

// Real tool components — imported here so the bundler tree-shakes the rest.
import { MergePdfTool } from "./tools/merge-pdf";
import { SplitPdfTool } from "./tools/split-pdf";
import { CompressPdfTool } from "./tools/compress-pdf";
import { RotatePdfTool } from "./tools/rotate-pdf";
import { DeletePagesTool } from "./tools/delete-pages";
import { NumberPagesTool } from "./tools/number-pages";
import { PdfToA4Tool } from "./tools/pdf-to-a4";
import { OrganizePagesTool } from "./tools/organize-pages";
import { ReorderPagesTool } from "./tools/reorder-pages";
import { WatermarkPdfTool } from "./tools/watermark-pdf";
import { ProtectPdfTool } from "./tools/protect-pdf";
import { UnlockPdfTool } from "./tools/unlock-pdf";
import { ImagesToPdfTool } from "./tools/images-to-pdf";
import { PdfToImagesTool } from "./tools/pdf-to-images";
import { HtmlToPdfTool } from "./tools/html-to-pdf";
import { JsonToPdfTool } from "./tools/json-to-pdf";
import { AiSummarizeTool } from "./tools/ai-summarize";
import { AiTranslateTool } from "./tools/ai-translate";
import { AiChatTool } from "./tools/ai-chat";
import { AiKeypointsTool } from "./tools/ai-keypoints";

type ToolComponentType = React.ComponentType<{
  tool: NonNullable<ReturnType<typeof getToolById>>;
}>;

/**
 * Map of ToolId → tool UI component.
 * Tools absent from this map fall back to `ComingSoonTool` (a friendly
 * "in progress" placeholder).
 */
export const TOOL_COMPONENTS: Partial<Record<string, ToolComponentType>> = {
  "merge-pdf": MergePdfTool,
  "split-pdf": SplitPdfTool,
  "compress-pdf": CompressPdfTool,
  "rotate-pdf": RotatePdfTool,
  "delete-pages": DeletePagesTool,
  "number-pages": NumberPagesTool,
  "pdf-to-a4": PdfToA4Tool,
  "organize-pages": OrganizePagesTool,
  "reorder-pages": ReorderPagesTool,
  "watermark-pdf": WatermarkPdfTool,
  "protect-pdf": ProtectPdfTool,
  "unlock-pdf": UnlockPdfTool,
  "images-to-pdf": ImagesToPdfTool,
  "pdf-to-images": PdfToImagesTool,
  "html-to-pdf": HtmlToPdfTool,
  "json-to-pdf": JsonToPdfTool,
  "ai-summarize": AiSummarizeTool,
  "ai-translate": AiTranslateTool,
  "ai-chat": AiChatTool,
  "ai-keypoints": AiKeypointsTool,
};

export function ToolView() {
  const activeToolId = useAppStore((s) => s.activeToolId);
  if (!activeToolId) return null;
  const tool = getToolById(activeToolId);
  if (!tool) return null;

  // Route special "resource" tools to dedicated views handled elsewhere.
  if (tool.id === "blog" || tool.id === "about") return null;

  const Component = TOOL_COMPONENTS[tool.id];
  if (!Component) return <ComingSoonTool tool={tool} />;
  return <Component tool={tool} />;
}
