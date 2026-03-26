import { NextRequest, NextResponse } from "next/server";

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const res = await fetch(`${process.env.RAILWAY_WORKER_URL}/sessions/${id}/stop`, {
      method: "POST",
      headers: { "X-API-Secret": process.env.RAILWAY_API_SECRET! },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: data.detail || "Failed to stop session" },
        { status: res.status },
      );
    }

    return NextResponse.json({ stopped: true });
  } catch {
    return NextResponse.json(
      { error: "Panel worker is currently unavailable." },
      { status: 503 },
    );
  }
}
