import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, sessions(count)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const displayName = request.cookies.get("lemnisca-user")?.value || "anonymous";

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ name: body.name, description: body.description || "", created_by: displayName })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
