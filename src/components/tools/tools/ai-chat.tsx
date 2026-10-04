"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import {
  Loader2,
  FileText,
  RotateCcw,
  ShieldCheck,
  Send,
  User,
  Sparkles,
} from "lucide-react";
import { ToolShell, type ProcessStatus } from "../tool-shell";
import { FileDropzone } from "../file-dropzone";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/lib/store";
import { extractTextFromPdf } from "@/lib/pdf/extract-text";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Tool } from "@/lib/tools";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ExtractState {
  status: "idle" | "extracting" | "done" | "error";
  text: string;
  pages: number;
  error: string | null;
}

const INITIAL_EXTRACT: ExtractState = {
  status: "idle",
  text: "",
  pages: 0,
  error: null,
};

const STARTER_QUESTIONS = [
  "What is this document about?",
  "Summarize the key takeaways.",
  "Who is the intended audience?",
  "List any dates, names, or numbers mentioned.",
];

export function AiChatTool({ tool }: { tool: Tool }) {
  const addRecent = useAppStore((s) => s.addRecent);

  const [file, setFile] = useState<File | null>(null);
  const [extract, setExtract] = useState<ExtractState>(INITIAL_EXTRACT);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the latest message whenever the conversation grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const handleFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setExtract({ ...INITIAL_EXTRACT, status: "extracting" });
    setMessages([]);
    setInput("");
    setError(null);
    setRecorded(false);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const { text, pages } = await extractTextFromPdf(bytes);
      if (!text.trim()) {
        setExtract({
          status: "error",
          text: "",
          pages,
          error:
            "No selectable text could be extracted from this PDF. It may be a scanned image — try the OCR tool first.",
        });
        return;
      }
      setExtract({ status: "done", text, pages, error: null });
    } catch (err) {
      setExtract({
        status: "error",
        text: "",
        pages: 0,
        error:
          err instanceof Error ? err.message : "Failed to read the PDF file.",
      });
    }
  }, []);

  const handleResetFile = useCallback(() => {
    setFile(null);
    setExtract(INITIAL_EXTRACT);
    setMessages([]);
    setInput("");
    setError(null);
    setRecorded(false);
  }, []);

  const handleSend = useCallback(
    async (questionOverride?: string) => {
      const question = (questionOverride ?? input).trim();
      if (!question || !extract.text || thinking) return;

      const nextMessages: ChatMessage[] = [
        ...messages,
        { role: "user", content: question },
      ];
      setMessages(nextMessages);
      setInput("");
      setThinking(true);
      setError(null);

      // Build the history we send to the backend: prior turns excluding the
      // question we're about to ask (the backend will append it).
      const history = nextMessages.slice(0, -1).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: extract.text,
            question,
            history,
          }),
        });
        const data = (await res.json().catch(() => null)) as
          | { answer?: string; error?: string }
          | null;
        if (!res.ok || !data?.answer) {
          throw new Error(
            data?.error ?? `Request failed with status ${res.status}`,
          );
        }
        setMessages([...nextMessages, { role: "assistant", content: data.answer }]);
        if (!recorded) {
          addRecent({
            name: file?.name ?? "chat.pdf",
            toolId: "ai-chat",
            size: extract.text.length,
          });
          setRecorded(true);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to get a response.",
        );
      } finally {
        setThinking(false);
      }
    },
    [extract.text, input, messages, thinking, recorded, addRecent, file],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd/Ctrl+Enter sends; plain Enter inserts a newline.
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const toolStatus: ProcessStatus =
    extract.status === "extracting"
      ? "processing"
      : extract.status === "error"
        ? "error"
        : "idle";

  const statusMessage =
    extract.status === "extracting" ? "Extracting text from PDF…" : undefined;

  return (
    <ToolShell
      tool={tool}
      status={toolStatus}
      statusMessage={statusMessage}
      onReset={file ? handleResetFile : undefined}
    >
      {!file && (
        <FileDropzone
          accept="application/pdf"
          multiple={false}
          onFiles={handleFiles}
          title="Drop a PDF here"
          hint="or click to browse — single PDF file"
        />
      )}

      {file && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid place-items-center h-9 w-9 rounded-md bg-secondary text-primary shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                  {extract.status === "done"
                    ? ` · ${extract.pages} page${extract.pages === 1 ? "" : "s"} · ${extract.text.length.toLocaleString()} chars extracted`
                    : extract.status === "extracting"
                      ? " · extracting…"
                      : ""}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFile}
              aria-label="Remove file"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Replace
            </Button>
          </div>

          {extract.status === "error" && extract.error && (
            <p className="text-sm text-destructive">{extract.error}</p>
          )}

          {extract.status === "done" && (
            <div className="flex flex-col rounded-lg border border-border bg-background">
              {/* Conversation area */}
              <div
                ref={scrollRef}
                className="scroll-soft max-h-[460px] min-h-[260px] overflow-y-auto p-4 space-y-3"
              >
                {messages.length === 0 && !thinking && (
                  <div className="space-y-3">
                    <div className="flex gap-2 items-start rounded-md bg-secondary/60 p-3 text-sm">
                      <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <p>
                        Ask anything about this document. Try one of these to
                        get started:
                      </p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {STARTER_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          onClick={() => handleSend(q)}
                          className="text-left text-sm rounded-md border border-border bg-background p-2.5 hover:border-primary/40 hover:bg-accent/30 transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m, i) => (
                  <ChatBubble key={i} message={m} />
                ))}

                {thinking && (
                  <div className="flex items-start gap-2.5">
                    <div className="grid place-items-center h-7 w-7 rounded-full bg-primary/10 text-primary shrink-0">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm bg-secondary/60 px-3 py-2 text-sm text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      thinking…
                    </div>
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className="border-t border-border p-3 space-y-2">
                {error && (
                  <p className="text-xs text-destructive">{error}</p>
                )}
                <div className="flex items-end gap-2">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question about the document…"
                    className="min-h-[44px] max-h-40 resize-none"
                    rows={1}
                  />
                  <Button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || thinking}
                    size="icon"
                    aria-label="Send question"
                  >
                    {thinking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Press <kbd className="px-1 rounded border bg-muted">⌘/Ctrl</kbd>
                  + <kbd className="px-1 rounded border bg-muted">Enter</kbd> to
                  send.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI-specific privacy note */}
      <div className="flex items-start gap-2 rounded-md bg-secondary/60 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p>
          Only the extracted{" "}
          <strong className="text-foreground">text</strong> is sent to our AI
          backend — your PDF file never leaves your device.
        </p>
      </div>
    </ToolShell>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      className={cn(
        "flex items-start gap-2.5",
        isUser && "flex-row-reverse",
      )}
    >
      <div
        className={cn(
          "grid place-items-center h-7 w-7 rounded-full shrink-0",
          isUser
            ? "bg-foreground/10 text-foreground"
            : "bg-primary/10 text-primary",
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
      </div>
      <div
        className={cn(
          "rounded-2xl px-3 py-2 text-sm max-w-[80%]",
          isUser
            ? "rounded-tr-sm bg-primary text-primary-foreground"
            : "rounded-tl-sm bg-secondary/60",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">
            {message.content}
          </p>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_pre]:my-2 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
