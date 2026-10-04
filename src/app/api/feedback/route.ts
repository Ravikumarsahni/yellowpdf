import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.message !== "string" || !body.message.trim()) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 },
      );
    }

    const name =
      typeof body.name === "string" ? body.name.slice(0, 200) : null;
    const email =
      typeof body.email === "string" ? body.email.slice(0, 320) : null;
    const category =
      typeof body.category === "string" && body.category.length <= 40
        ? body.category
        : "general";
    const message = body.message.slice(0, 8000);
    const rating =
      Number.isFinite(body.rating) && body.rating >= 1 && body.rating <= 5
        ? Math.round(body.rating)
        : 5;

    const feedback = await db.feedback.create({
      data: {
        name: name ?? undefined,
        email: email ?? undefined,
        category,
        message,
        rating,
      },
    });

    return NextResponse.json({ ok: true, id: feedback.id });
  } catch (err) {
    console.error("[feedback] create failed:", err);
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const total = await db.feedback.count();
    const avg =
      total > 0
        ? await db.feedback.aggregate({ _avg: { rating: true } })
        : null;
    return NextResponse.json({
      total,
      avgRating: avg?._avg.rating ?? null,
    });
  } catch (err) {
    console.error("[feedback] list failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch feedback stats" },
      { status: 500 },
    );
  }
}
