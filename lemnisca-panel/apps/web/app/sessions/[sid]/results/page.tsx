"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SynthesisView } from "@/components/synthesis-view";
import { ExportButtons } from "@/components/export-buttons";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import type { Session, Message, Persona, Synthesis } from "@/lib/types";

const COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500",
  "bg-orange-500", "bg-pink-500", "bg-teal-500",
  "bg-red-500", "bg-indigo-500",
];

export default function ResultsPage() {
  const { sid } = useParams<{ sid: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`/api/sessions/${sid}`)
      .then((r) => r.json())
      .then((data) => {
        setSession(data.session);
        setMessages(data.messages);
        setSynthesis(data.synthesis);
        setPersonas(data.personas);
      });
  }, [sid]);

  if (!session) return <div className="p-8">Loading...</div>;

  const personaMap = Object.fromEntries(personas.map((p, i) => [p.id, { name: p.name, color: COLORS[i % COLORS.length] }]));

  const filteredMessages = search
    ? messages.filter((m) => {
        const persona = personaMap[m.persona_id];
        return (
          m.content.toLowerCase().includes(search.toLowerCase()) ||
          persona?.name.toLowerCase().includes(search.toLowerCase())
        );
      })
    : messages;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <Link href={`/projects/${session.project_id}`} className="text-sm text-muted-foreground hover:underline">
        &larr; Back to project
      </Link>

      <div className="flex items-center gap-3 mt-2 mb-6">
        <h1 className="text-2xl font-bold">Session Results</h1>
        <Badge>{session.status}</Badge>
        <span className="text-sm text-muted-foreground">{messages.length} turns</span>
      </div>

      {session.status === "failed" && session.error_message && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm">
          Error: {session.error_message}
        </div>
      )}
      {session.status === "cancelled" && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
          Session was stopped after turn {messages.length} of {session.max_rounds}.
        </div>
      )}

      <ExportButtons sessionId={sid} messages={messages} synthesis={synthesis} personas={personas} />

      <Tabs defaultValue={synthesis ? "synthesis" : "transcript"} className="mt-6">
        <TabsList>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="synthesis" disabled={!synthesis}>Synthesis</TabsTrigger>
        </TabsList>

        <TabsContent value="transcript" className="mt-4">
          <Input
            placeholder="Search transcript..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4 max-w-sm"
          />
          <div className="space-y-4">
            {filteredMessages.map((msg) => {
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
          </div>
        </TabsContent>

        <TabsContent value="synthesis" className="mt-4">
          {synthesis && (
            <div id="synthesis-content">
              <SynthesisView content={synthesis.content} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
