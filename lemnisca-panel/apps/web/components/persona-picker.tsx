"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Persona } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onAdd: (persona: Persona) => void;
}

export function PersonaPicker({ open, onOpenChange, projectId, onAdd }: Props) {
  const [templates, setTemplates] = useState<Persona[]>([]);

  useEffect(() => {
    if (open) {
      fetch("/api/templates").then((r) => r.json()).then(setTemplates);
    }
  }, [open]);

  async function cloneTemplate(template: Persona) {
    const res = await fetch("/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: template.name,
        role: template.role,
        description: template.description,
        system_prompt: template.system_prompt,
        project_id: projectId,
        is_template: false,
      }),
    });
    if (res.ok) {
      const cloned = await res.json();
      onAdd(cloned);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add from Templates</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>{t.name}</span>
                  <Button size="sm" onClick={() => cloneTemplate(t)}>Add</Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <p className="text-xs text-muted-foreground">{t.role} — {t.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
