import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("personas")
    .select("*")
    .eq("is_template", true)
    .is("project_id", null)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("personas")
    .insert({
      name: body.name,
      role: body.role,
      description: body.description,
      system_prompt: body.system_prompt,
      is_template: true,
      project_id: null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
