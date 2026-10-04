"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { RecentView } from "@/components/views/recent-view";
import { BlogView, AboutView } from "@/components/views/blog-about-views";
import { FeedbackView } from "@/components/views/feedback-view";
import { ToolView } from "@/components/tools/registry";
import { useAppStore } from "@/lib/store";

export default function Home() {
  const view = useAppStore((s) => s.view);
  const hydrateFromStorage = useAppStore((s) => s.hydrateFromStorage);

  // Load persisted state (recent files, sidebar) once on mount.
  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  return (
    <AppShell>
      {view === "dashboard" && <DashboardView />}
      {view === "recent" && <RecentView />}
      {view === "starred" && <RecentView starredOnly />}
      {view === "blog" && <BlogView />}
      {view === "about" && <AboutView />}
      {view === "feedback" && <FeedbackView />}
      {view === "tool" && <ToolView />}
    </AppShell>
  );
}
