import { NextRequest, NextResponse } from "next/server";

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const res = await fetch(`${process.env.RAILWAY_WORKER_URL}/sessions/${id}/start`, {
      method: "POST",
      headers: { "X-API-Secret": process.env.RAILWAY_API_SECRET! },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: data.detail || "Failed to start session" },
        { status: res.status },
      );
    }

    return NextResponse.json({ started: true });
  } catch {
    return NextResponse.json(
      { error: "Panel worker is currently unavailable. Please try again later." },
      { status: 503 },
    );
  }
}
