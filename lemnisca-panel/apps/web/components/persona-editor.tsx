"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Persona } from "@/lib/types";

interface Props {
  persona?: Persona;
  projectId?: string;
  onSave: (persona?: Persona) => void;
  onDelete?: () => void;
}

export function PersonaEditor({ persona, projectId, onSave, onDelete }: Props) {
  const [name, setName] = useState(persona?.name || "");
  const [role, setRole] = useState(persona?.role || "");
  const [description, setDescription] = useState(persona?.description || "");
  const [systemPrompt, setSystemPrompt] = useState(persona?.system_prompt || "");
  const [expanded, setExpanded] = useState(!persona);

  async function handleSave() {
    const body = { name, role, description, system_prompt: systemPrompt, project_id: projectId };
    const url = persona ? `/api/personas/${persona.id}` : "/api/personas";
    const method = persona ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const saved = await res.json();
      onSave(saved);
      if (!persona) {
        setName("");
        setRole("");
        setDescription("");
        setSystemPrompt("");
      }
    }
  }

  async function handleSaveAsTemplate() {
    if (!persona) return;
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role, description, system_prompt: systemPrompt }),
    });
    alert("Saved as template!");
  }

  async function handleDelete() {
    if (persona && onDelete) {
      await fetch(`/api/personas/${persona.id}`, { method: "DELETE" });
      onDelete();
    }
  }

  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={() => persona && setExpanded(!expanded)}
      >
        <CardTitle className="text-base flex items-center justify-between">
          <span>{persona ? persona.name : "New Persona"}</span>
          {persona && (
            <span className="text-xs text-muted-foreground font-normal">{persona.role}</span>
          )}
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Role (one-line)</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <div>
            <Label>Description (for agent selector)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>System Prompt</Label>
            <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={12} className="font-mono text-xs" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave}>{persona ? "Save" : "Create"}</Button>
            {persona && persona.project_id && (
              <Button variant="outline" onClick={handleSaveAsTemplate}>Save as Template</Button>
            )}
            {persona && onDelete && (
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
