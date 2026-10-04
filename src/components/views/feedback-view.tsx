"use client";

import { useState } from "react";
import { Heart, Send, Star } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export function FeedbackView() {
  const setView = useAppStore((s) => s.setView);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Please write a message first");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, category, message, rating }),
      });
      if (!res.ok) throw new Error("Submit failed");
      toast.success("Thank you! Your feedback was sent.");
      setMessage("");
      setRating(5);
    } catch {
      toast.error("Something went wrong. Please try again later.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-6 md:px-10 py-8 max-w-2xl mx-auto">
      <button
        onClick={() => setView("dashboard")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        ← Back to all tools
      </button>

      <div className="flex items-center gap-2 mb-2">
        <div className="grid place-items-center h-10 w-10 rounded-xl bg-destructive/10 text-destructive">
          <Heart className="h-5 w-5" />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
          Feedback & Donate
        </h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Tell us what&apos;s broken, what&apos;s missing, or just say thanks.
        Donations keep YellowPDF free for everyone.
      </p>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-border bg-card p-5 md:p-6 space-y-4 shadow-sm"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name (optional)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email (optional)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="category" className="w-full">
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General feedback</SelectItem>
              <SelectItem value="bug">Bug report</SelectItem>
              <SelectItem value="feature">Feature request</SelectItem>
              <SelectItem value="praise">Praise 💛</SelectItem>
              <SelectItem value="donate">I want to donate</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="message">Message</Label>
          <Textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us anything…"
            rows={5}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label>How would you rate YellowPDF?</Label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className="p-1"
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
              >
                <Star
                  className={
                    n <= rating
                      ? "h-6 w-6 fill-primary text-primary"
                      : "h-6 w-6 text-muted-foreground"
                  }
                />
              </button>
            ))}
            <span className="ml-2 text-sm text-muted-foreground">
              {rating} / 5
            </span>
          </div>
        </div>

        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting ? (
            <>Sending…</>
          ) : (
            <>
              <Send className="h-4 w-4 mr-1.5" />
              Send feedback
            </>
          )}
        </Button>
      </form>

      {/* Donate CTA */}
      <div className="mt-6 rounded-2xl bg-brand-gradient border border-primary/30 p-6 text-center">
        <Heart className="h-8 w-8 text-destructive mx-auto mb-2 fill-destructive" />
        <p className="font-bold text-lg">YellowPDF is free, forever.</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          If we saved you time today, consider buying us a coffee. Donations
          fund hosting, the LLM API for AI tools, and the next 10 tools on our
          roadmap.
        </p>
        <Button className="mt-3" variant="default">
          <Heart className="h-4 w-4 mr-1.5 fill-current" />
          Donate $5
        </Button>
      </div>
    </div>
  );
}
