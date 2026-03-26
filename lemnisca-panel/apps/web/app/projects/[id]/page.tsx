"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PersonaEditor } from "@/components/persona-editor";
import { PersonaPicker } from "@/components/persona-picker";
import Link from "next/link";
import type { Project, Persona, Session } from "@/lib/types";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showNewPersona, setShowNewPersona] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${id}`).then((r) => r.json()).then(setProject);
    fetch(`/api/personas?project_id=${id}`).then((r) => r.json()).then(setPersonas);
    fetch(`/api/sessions?project_id=${id}`).then((r) => r.json()).then(setSessions);
  }, [id]);

  function refreshPersonas() {
    fetch(`/api/personas?project_id=${id}`).then((r) => r.json()).then(setPersonas);
  }

  async function duplicateSession(session: Session) {
    const detailRes = await fetch(`/api/sessions/${session.id}`);
    const detail = await detailRes.json();
    const personaIds = detail.personas?.map((p: any) => p.id) || [];

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: id,
        problem_statement: session.problem_statement,
        max_rounds: session.max_rounds,
        temperature: session.temperature,
        model: session.model,
        persona_ids: personaIds,
      }),
    });
    if (res.ok) {
      fetch(`/api/sessions?project_id=${id}`).then((r) => r.json()).then(setSessions);
    }
  }

  async function deleteProject() {
    if (!confirm("Delete this project and all its data?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (!project) return <div className="p-8">Loading...</div>;

  const statusColor: Record<string, string> = {
    pending: "bg-gray-200",
    running: "bg-blue-200 text-blue-800",
    completed: "bg-green-200 text-green-800",
    cancelled: "bg-yellow-200 text-yellow-800",
    failed: "bg-red-200 text-red-800",
  };

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            &larr; Projects
          </Link>
          <h1 className="text-2xl font-bold mt-1">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.description}</p>
        </div>
      </div>

      <Tabs defaultValue="personas">
        <TabsList>
          <TabsTrigger value="personas">Personas ({personas.length})</TabsTrigger>
          <TabsTrigger value="sessions">Sessions ({sessions.length})</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="personas" className="space-y-4 mt-4">
          <div className="flex gap-2">
            <Button onClick={() => setPickerOpen(true)}>Add from Templates</Button>
            <Button variant="outline" onClick={() => setShowNewPersona(true)}>Create Custom</Button>
          </div>
          <PersonaPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            projectId={id}
            onAdd={() => refreshPersonas()}
          />
          {showNewPersona && (
            <PersonaEditor
              projectId={id}
              onSave={() => { setShowNewPersona(false); refreshPersonas(); }}
            />
          )}
          {personas.map((p) => (
            <PersonaEditor
              key={p.id}
              persona={p}
              projectId={id}
              onSave={refreshPersonas}
              onDelete={refreshPersonas}
            />
          ))}
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <div className="mb-4">
            <Link href={`/projects/${id}/sessions/new`}>
              <Button>New Session</Button>
            </Link>
          </div>
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 border rounded">
                <Link href={s.status === "running" ? `/sessions/${s.id}` : `/sessions/${s.id}/results`}
                  className="flex items-center gap-3 flex-1 hover:underline">
                  <Badge className={statusColor[s.status]}>{s.status}</Badge>
                  <span className="text-sm">{s.max_rounds} turns</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => duplicateSession(s)}>
                  Duplicate
                </Button>
              </div>
            ))}
            {sessions.length === 0 && (
              <p className="text-sm text-muted-foreground">No sessions yet.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4 space-y-4 max-w-md">
          <div>
            <Label>Project Name</Label>
            <Input defaultValue={project.name} onBlur={(e) => {
              fetch(`/api/projects/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: e.target.value, description: project.description }),
              });
            }} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea defaultValue={project.description} onBlur={(e) => {
              fetch(`/api/projects/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: project.name, description: e.target.value }),
              });
            }} />
          </div>
          <Button variant="destructive" onClick={deleteProject}>Delete Project</Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
