"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReactMarkdown from "react-markdown";

const COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500",
  "bg-orange-500", "bg-pink-500", "bg-teal-500",
];

export default function SharedSessionPage() {
  const { sid } = useParams<{ sid: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data: session, error: sErr } = await supabase
        .from("sessions").select("*").eq("id", sid).single();
      if (sErr) { setError("Session not found"); return; }

      const [msgRes, synRes, personaRes] = await Promise.all([
        supabase.from("messages").select("*").eq("session_id", sid).order("turn_number"),
        supabase.from("syntheses").select("*").eq("session_id", sid).maybeSingle(),
        supabase.from("session_personas").select("*, personas(*)").eq("session_id", sid).order("position"),
      ]);

      setData({
        session,
        messages: msgRes.data || [],
        synthesis: synRes.data,
        personas: personaRes.data?.map((sp: any) => sp.personas) || [],
      });
    }
    load();
  }, [sid]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!data) return <div className="p-8">Loading...</div>;

  const personaMap = Object.fromEntries(
    data.personas.map((p: any, i: number) => [p.id, { name: p.name, color: COLORS[i % COLORS.length] }])
  );

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-1">Discussion Session</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {data.messages.length} turns &middot; {data.session.status} &middot;{" "}
        {new Date(data.session.created_at).toLocaleDateString()}
      </p>

      <Tabs defaultValue={data.synthesis ? "synthesis" : "transcript"}>
        <TabsList>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="synthesis" disabled={!data.synthesis}>Synthesis</TabsTrigger>
        </TabsList>

        <TabsContent value="transcript" className="mt-4 space-y-4">
          {data.messages.map((msg: any) => {
            const persona = personaMap[msg.persona_id] || { name: "Unknown", color: "bg-gray-500" };
            return (
              <div key={msg.id} className="flex gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${persona.color}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{persona.name}</span>
                    <span className="text-xs text-muted-foreground">Turn {msg.turn_number}</span>
                  </div>
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="synthesis" className="mt-4">
          {data.synthesis && (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{data.synthesis.content}</ReactMarkdown>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
