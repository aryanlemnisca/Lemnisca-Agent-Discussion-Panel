import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  const supabase = getServiceClient();

  let query = supabase.from("sessions").select("*").order("created_at", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = getServiceClient();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      project_id: body.project_id,
      problem_statement: body.problem_statement,
      max_rounds: body.max_rounds || 50,
      temperature: body.temperature || 0.7,
      model: body.model || "gemini-3.1-pro-preview",
    })
    .select()
    .single();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });

  if (body.persona_ids && body.persona_ids.length >= 2) {
    const joins = body.persona_ids.map((pid: string, i: number) => ({
      session_id: session.id,
      persona_id: pid,
      position: i + 1,
    }));
    const { error: joinError } = await supabase.from("session_personas").insert(joins);
    if (joinError) return NextResponse.json({ error: joinError.message }, { status: 500 });
  }

  return NextResponse.json(session, { status: 201 });
}
