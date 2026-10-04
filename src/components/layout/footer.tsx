"use client";

import Link from "next/link";
import { Heart, Github, Twitter, Mail } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { CATEGORIES } from "@/lib/tools";

export function Footer() {
  const setView = useAppStore((s) => s.setView);
  const openTool = useAppStore((s) => s.openTool);
  const setCategory = useAppStore((s) => s.setCategory);

  return (
    <footer className="mt-auto border-t border-border bg-secondary/40">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary text-primary-foreground font-black text-sm">
                Y
              </div>
              <span className="font-extrabold tracking-tight">
                Yellow<span className="text-primary">PDF</span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">
              The free online PDF editor built for speed. Everything runs in
              your browser — your files never leave your device. No watermark,
              no sign-up, no limits.
            </p>
            <div className="flex items-center gap-3 mt-4">
              <a
                href="#"
                className="grid place-items-center h-8 w-8 rounded-md border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
                aria-label="GitHub"
              >
                <Github className="h-4 w-4" />
              </a>
              <a
                href="#"
                className="grid place-items-center h-8 w-8 rounded-md border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
                aria-label="Twitter"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                href="#"
                className="grid place-items-center h-8 w-8 rounded-md border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
                aria-label="Email"
              >
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Top categories */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Top Tools
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  onClick={() => openTool("merge-pdf")}
                  className="text-foreground/80 hover:text-primary"
                >
                  Merge PDF
                </button>
              </li>
              <li>
                <button
                  onClick={() => openTool("split-pdf")}
                  className="text-foreground/80 hover:text-primary"
                >
                  Split PDF
                </button>
              </li>
              <li>
                <button
                  onClick={() => openTool("compress-pdf")}
                  className="text-foreground/80 hover:text-primary"
                >
                  Compress PDF
                </button>
              </li>
              <li>
                <button
                  onClick={() => openTool("edit-pdf")}
                  className="text-foreground/80 hover:text-primary"
                >
                  Edit PDF
                </button>
              </li>
              <li>
                <button
                  onClick={() => openTool("images-to-pdf")}
                  className="text-foreground/80 hover:text-primary"
                >
                  Images to PDF
                </button>
              </li>
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Categories
            </h4>
            <ul className="space-y-2 text-sm">
              {CATEGORIES.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      setCategory(c.id);
                      setView("dashboard");
                    }}
                    className="text-foreground/80 hover:text-primary text-left"
                  >
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Resources
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  onClick={() => openTool("blog")}
                  className="text-foreground/80 hover:text-primary"
                >
                  Technical Blog
                </button>
              </li>
              <li>
                <button
                  onClick={() => openTool("about")}
                  className="text-foreground/80 hover:text-primary"
                >
                  About Us
                </button>
              </li>
              <li>
                <button
                  onClick={() => setView("feedback")}
                  className="text-foreground/80 hover:text-primary"
                >
                  Send Feedback
                </button>
              </li>
              <li>
                <button
                  onClick={() => setView("feedback")}
                  className="text-foreground/80 hover:text-primary inline-flex items-center gap-1"
                >
                  <Heart className="h-3 w-3 text-destructive" /> Donate
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} YellowPDF. Built for 100k+ users with
            client-side processing.
          </p>
          <p className="flex items-center gap-1">
            Made with <Heart className="h-3 w-3 text-destructive fill-destructive" /> for everyone, everywhere.
          </p>
        </div>
      </div>
    </footer>
  );
}
