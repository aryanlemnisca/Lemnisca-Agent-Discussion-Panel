"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { LiveTranscript } from "@/components/live-transcript";
import Link from "next/link";
import type { Session, Message, Persona } from "@/lib/types";

export default function LiveSessionPage() {
  const { sid } = useParams<{ sid: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [lastMessageAt, setLastMessageAt] = useState<Date | null>(null);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    fetch(`/api/sessions/${sid}`)
      .then((r) => r.json())
      .then((data) => {
        setSession(data.session);
        setMessages(data.messages);
        setPersonas(data.personas);
        if (data.messages.length > 0) {
          setLastMessageAt(new Date(data.messages[data.messages.length - 1].created_at));
        }
      });
  }, [sid]);

  useEffect(() => {
    const channel = supabase
      .channel(`session-${sid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sid}` },
        (payload) => {
          setSession(payload.new as Session);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sid]);

  useEffect(() => {
    const channel = supabase
      .channel(`msg-track-${sid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${sid}` },
        () => { setLastMessageAt(new Date()); setStalled(false); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sid]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (session?.started_at) {
        setElapsed(Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000));
      }
      if (lastMessageAt && Date.now() - lastMessageAt.getTime() > 5 * 60 * 1000) {
        setStalled(true);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.started_at, lastMessageAt]);

  async function handleStop() {
    await fetch(`/api/sessions/${sid}/stop`, { method: "POST" });
  }

  if (!session) return <div className="p-8">Loading...</div>;

  const isActive = session.status === "running";
  const isDone = ["completed", "cancelled", "failed"].includes(session.status);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm">
            Turn {messages.length}/{session.max_rounds}
          </span>
          <div className="w-48 h-2 bg-gray-200 rounded-full">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${(messages.length / session.max_rounds) * 100}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {minutes}:{seconds.toString().padStart(2, "0")}
          </span>
        </div>
        {isActive && (
          <Button variant="destructive" size="sm" onClick={handleStop}>
            Stop
          </Button>
        )}
      </div>

      {stalled && isActive && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
          This session may have stalled. You can wait or try stopping and restarting.
        </div>
      )}

      {isDone && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm flex items-center justify-between">
          <span>
            Session {session.status}.{" "}
            {session.status === "cancelled" && `Stopped after turn ${messages.length} of ${session.max_rounds}.`}
          </span>
          <Link href={`/sessions/${sid}/results`}>
            <Button size="sm">View Results</Button>
          </Link>
        </div>
      )}

      {session.status === "failed" && session.error_message && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm">
          Error: {session.error_message}
        </div>
      )}

      <LiveTranscript sessionId={sid} initialMessages={messages} personas={personas} />
    </div>
  );
}
