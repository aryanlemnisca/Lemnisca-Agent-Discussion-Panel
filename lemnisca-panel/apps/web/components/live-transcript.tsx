"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import ReactMarkdown from "react-markdown";
import type { Message, Persona } from "@/lib/types";

const COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500",
  "bg-orange-500", "bg-pink-500", "bg-teal-500",
  "bg-red-500", "bg-indigo-500",
];

interface Props {
  sessionId: string;
  initialMessages: Message[];
  personas: Persona[];
}

export function LiveTranscript({ sessionId, initialMessages, personas }: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const bottomRef = useRef<HTMLDivElement>(null);

  const personaMap = Object.fromEntries(personas.map((p, i) => [p.id, { name: p.name, color: COLORS[i % COLORS.length] }]));

  useEffect(() => {
    const channel = supabase
      .channel(`messages-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="space-y-4">
      {messages.map((msg) => {
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
      <div ref={bottomRef} />
    </div>
  );
}
