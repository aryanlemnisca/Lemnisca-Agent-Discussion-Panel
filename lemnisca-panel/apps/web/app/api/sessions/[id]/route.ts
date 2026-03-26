import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceClient();

  const [sessionRes, messagesRes, synthesisRes, personasRes] = await Promise.all([
    supabase.from("sessions").select("*").eq("id", id).single(),
    supabase.from("messages").select("*, personas(name)").eq("session_id", id).order("turn_number"),
    supabase.from("syntheses").select("*").eq("session_id", id).maybeSingle(),
    supabase.from("session_personas").select("*, personas(*)").eq("session_id", id).order("position"),
  ]);

  if (sessionRes.error) return NextResponse.json({ error: sessionRes.error.message }, { status: 404 });

  return NextResponse.json({
    session: sessionRes.data,
    messages: messagesRes.data || [],
    synthesis: synthesisRes.data,
    personas: personasRes.data?.map((sp: any) => ({ ...sp.personas, position: sp.position })) || [],
  });
}
