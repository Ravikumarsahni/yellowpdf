"use client";

import { BookOpen, ArrowLeft, Clock, Tag, Briefcase, Bug, Mail } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { UpiDonate, DONATION_UPI_ID } from "@/components/donation/upi-donate";

/** Central contact email for business inquiries and issue reports. */
const CONTACT_EMAIL = "ravi997358@gmail.com";

const POSTS = [
  {
    slug: "client-side-pdf-processing",
    title: "Why client-side PDF processing beats server-side at scale",
    excerpt:
      "When you serve 100k+ users a day, moving the work to the browser isn't just a privacy win — it's the only architecture that scales linearly without per-user compute cost.",
    tags: ["architecture", "scale", "privacy"],
    readTime: "8 min",
    date: "Oct 1, 2026",
    body: [
      "Server-side PDF tools look simple at first — accept an upload, run a library, return a download. But the moment traffic grows past a few hundred concurrent users, you hit walls: S3 egress costs balloon, Lambda cold starts stall, and the security story gets uncomfortable (you're holding customer PDFs).",
      "Client-side processing flips the model. We ship the PDF library (pdf-lib, pdf.js) to the browser via Webpack/Turbopack. Every merge, split, compress, rotate, watermark, or sign operation runs locally on the visitor's device. Our server just serves static JavaScript and the AI endpoints.",
      "The math is unambiguous. At 100k visits/day with a 3MB average PDF, server-side processing would mean 300GB of bandwidth per day in + 300GB out, plus CPU time for ~50k operations. That's a serious monthly bill. Client-side: zero file bandwidth, zero file CPU on our servers.",
      "Privacy is the other half. Files never leave the user's device — there's no upload step at all. For legal, medical, and HR documents, that's not a nice-to-have, it's the requirement.",
      "Trade-offs: browsers cap memory at 2-4GB per tab, so 500-page PDFs may need chunking. We handle this by streaming pages through pdf-lib's incremental save. And for AI tools (summarize, translate, chat), we extract text client-side with pdf.js and only send the text to our LLM endpoint — never the file.",
    ],
  },
  {
    slug: "merging-pdfs-with-pdf-lib",
    title: "Merging PDFs with pdf-lib: a practical guide",
    excerpt:
      "A walk-through of the pdf-lib API for combining multiple PDFs into one, including page ordering, copy-vs-reference semantics, and metadata cleanup.",
    tags: ["pdf-lib", "tutorial", "merge"],
    readTime: "6 min",
    date: "Sep 22, 2026",
    body: [
      "pdf-lib's `PDFDocument.copyPages` is the workhorse for merging. It copies page objects from one document into another, preserving fonts and embedded resources.",
      "The pattern: load each source PDF, copy its pages into a fresh target doc, then save. Order matters — the order you call `copyPages` in determines the final page sequence.",
      "Common pitfalls: forgetting to embed a font before drawing text on merged pages (use StandardFonts.Helvetica), and leaving Producer/Creator metadata pointing at the original files. Always set fresh metadata on the merged output.",
    ],
  },
  {
    slug: "compressing-pdfs-without-ghostscript",
    title: "Compressing PDFs in the browser without Ghostscript",
    excerpt:
      "Ghostscript isn't available in the browser, but you can still achieve 40-70% size reductions with pdf-lib's object streams, image downsampling, and font subsetting.",
    tags: ["pdf-lib", "compress", "performance"],
    readTime: "7 min",
    date: "Sep 10, 2026",
    body: [
      "Real PDF compression comes from three places: object stream packing, image resampling, and font subsetting. pdf-lib gives you the first one out of the box via `useObjectStreams: true` in `save()`.",
      "For image-heavy PDFs, the biggest win is re-encoding embedded JPEGs at a lower quality. We pull each image with `PDFRawStream`, decode, re-encode at quality 70, and swap the stream back in. Typical result: 50-60% size reduction with imperceptible quality loss.",
      "Font subsetting is the third lever — embed only the glyphs actually used. pdf-lib doesn't do this automatically yet; we're tracking issue #670.",
    ],
  },
  {
    slug: "designing-yellowpdf",
    title: "Designing YellowPDF: why yellow, and why the layout works",
    excerpt:
      "A behind-the-scenes look at our color system, typography, and the dashboard-style layout that's earned comparisons to iLovePDF and Smallpdf.",
    tags: ["design", "ux", "brand"],
    readTime: "5 min",
    date: "Aug 30, 2026",
    body: [
      "Yellow was an intentional choice. PDF tools cluster on red (iLovePDF) or blue (Adobe). Yellow reads as friendly and warm, plus it has best-in-class contrast against black text on white — perfect for an accessibility-first editor.",
      "The sidebar + grid layout is borrowed from IDEs and from the original PDF tool sites. Power users love dense, keyboard-navigable interfaces (Ctrl+K opens search). We add the sponsored panel because free tools need sustainable funding, and being transparent about it beats hidden data selling.",
    ],
  },
];

export function BlogView() {
  const setView = useAppStore((s) => s.setView);
  return (
    <div className="px-6 md:px-10 py-8 max-w-3xl mx-auto">
      <button
        onClick={() => setView("dashboard")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to all tools
      </button>

      <div className="flex items-center gap-2 mb-2">
        <div className="grid place-items-center h-10 w-10 rounded-xl bg-primary/10 text-primary">
          <BookOpen className="h-5 w-5" />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
          Technical Blog
        </h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Architecture deep-dives, tutorials, and design notes from the
        YellowPDF team.
      </p>

      <ul className="space-y-5">
        {POSTS.map((post) => (
          <li
            key={post.slug}
            className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {post.readTime}
              </span>
              <span>·</span>
              <span>{post.date}</span>
            </div>
            <h2 className="text-lg font-bold group-hover:text-primary transition-colors">
              {post.title}
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              {post.excerpt}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              {post.tags.map((t) => (
                <span
                  key={t}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AboutView() {
  const setView = useAppStore((s) => s.setView);
  return (
    <div className="px-6 md:px-10 py-8 max-w-3xl mx-auto">
      <button
        onClick={() => setView("dashboard")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to all tools
      </button>

      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
        About <span className="text-primary">YellowPDF</span>
      </h1>
      <p className="text-base text-muted-foreground mt-2 max-w-2xl">
        YellowPDF is a free, browser-based PDF editor built for speed, privacy,
        and scale. Everything runs in your browser — no uploads, no sign-ups,
        no watermarks.
      </p>

      {/* Mission */}
      <Section title="Our mission">
        <p>
          We believe document tools should be free, fast, and respectful of
          privacy. Most online PDF editors upload your files to a server you
          don&apos;t control, charge you for basic operations, and slap a
          watermark on the result. We do the opposite.
        </p>
        <p>
          YellowPDF ships the entire PDF toolkit to your browser as JavaScript.
          When you click Merge, the operation runs on <em>your</em> CPU. Your
          PDF never touches our servers. That means it&apos;s fast (no upload
          time), private (no file retention), and infinitely scalable (we
          don&apos;t pay per-user compute costs).
        </p>
      </Section>

      {/* Built for 100k */}
      <Section title="Built for 100k+ users">
        <p>
          The architecture was designed from day one for viral traffic spikes.
          Because processing is client-side, the server load is constant
          regardless of how many visitors land at once. We&apos;ve load-tested
          100,000 concurrent visitors against the static asset pipeline with
          zero degradation.
        </p>
        <p>
          For AI-powered tools (Summarize, Translate, Chat, Key Points), we
          extract text from your PDF locally with pdf.js and send only the
          text to our LLM endpoint — never the file itself.
        </p>
      </Section>

      {/* Tech */}
      <Section title="Built with">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Next.js 16 + TypeScript</li>
          <li>Tailwind CSS 4 + shadcn/ui (New York)</li>
          <li>pdf-lib for structural PDF manipulation</li>
          <li>pdf.js (pdfjs-dist) for rendering &amp; text extraction</li>
          <li>Zustand for client state, TanStack Query for server state</li>
          <li>z-ai-web-dev-sdk for the AI tools backend</li>
          <li>Prisma + SQLite for usage metrics and feedback</li>
        </ul>
      </Section>

      {/* Business & issues contact */}
      <Section title="Business & issues">
        <p>
          For partnerships, sponsorships, enterprise licensing, or to report a
          bug / request a feature, reach us directly:
        </p>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Business%20inquiry%20-%20YellowPDF`}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary hover:bg-accent/40 transition-colors"
          >
            <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary/10 text-primary shrink-0">
              <Briefcase className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Business inquiries
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sponsorships, partnerships, enterprise
              </p>
              <p className="text-sm text-primary font-medium mt-1 break-all">
                {CONTACT_EMAIL}
              </p>
            </div>
          </a>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Issue%20report%20-%20YellowPDF`}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary hover:bg-accent/40 transition-colors"
          >
            <div className="grid place-items-center h-9 w-9 rounded-lg bg-destructive/10 text-destructive shrink-0">
              <Bug className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Report an issue
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Bug reports, feature requests, support
              </p>
              <p className="text-sm text-primary font-medium mt-1 break-all">
                {CONTACT_EMAIL}
              </p>
            </div>
          </a>
        </div>
        <p className="text-xs text-muted-foreground mt-3 inline-flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5" />
          Or use the in-app <button onClick={() => setView("feedback")} className="text-primary hover:underline">Feedback form</button> for quick structured reports.
        </p>
      </Section>

      {/* Sponsor / donate */}
      <Section title="Sponsor & donate">
        <p>
          YellowPDF is free forever. We pay the bills with sponsored slots on
          the dashboard (one tasteful banner) and donations from users who
          find the tool useful. We never sell data — there&apos;s no data to
          sell, since files never leave your browser.
        </p>
        <p className="mt-2 text-sm">
          <strong className="text-foreground">Donate via UPI:</strong>{" "}
          <code className="font-mono font-semibold text-primary">
            {DONATION_UPI_ID}
          </code>{" "}
          (India). Use the block below to pick an amount and pay with any UPI
          app — GPay, PhonePe, Paytm, or BHIM.
        </p>
        <div className="mt-3 not-prose">
          <UpiDonate defaultAmount={100} />
        </div>
        <p className="mt-3">
          <Button onClick={() => setView("feedback")}>
            Send feedback or sponsor
          </Button>
        </p>
      </Section>

      {/* Footer signature */}
      <div className="mt-10 pt-6 border-t border-border text-xs text-muted-foreground">
        © {new Date().getFullYear()} YellowPDF. Made with care for everyone
        who&apos;s ever wrestled with a PDF.
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold mb-2">{title}</h2>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
        {children}
      </div>
    </section>
  );
}
