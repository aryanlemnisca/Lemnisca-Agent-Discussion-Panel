"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PersonaEditor } from "@/components/persona-editor";
import type { Persona } from "@/lib/types";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Persona[]>([]);
  const [showNew, setShowNew] = useState(false);

  function refresh() {
    fetch("/api/templates").then((r) => r.json()).then(setTemplates);
  }

  useEffect(() => { refresh(); }, []);

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Persona Templates</h1>
        <Button onClick={() => setShowNew(true)}>Create Template</Button>
      </div>

      {showNew && (
        <div className="mb-4">
          <PersonaEditor onSave={() => { setShowNew(false); refresh(); }} />
        </div>
      )}

      <div className="space-y-3">
        {templates.map((t) => (
          <PersonaEditor
            key={t.id}
            persona={t}
            onSave={refresh}
            onDelete={refresh}
          />
        ))}
      </div>
    </div>
  );
}
