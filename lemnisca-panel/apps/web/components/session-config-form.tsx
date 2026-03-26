"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Persona } from "@/lib/types";

interface Props {
  projectId: string;
  personas: Persona[];
}

export function SessionConfigForm({ projectId, personas }: Props) {
  const router = useRouter();
  const [problemStatement, setProblemStatement] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [maxRounds, setMaxRounds] = useState(50);
  const [temperature, setTemperature] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function togglePersona(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.length < 2) {
      setError("Select at least 2 personas");
      return;
    }
    if (!problemStatement.trim()) {
      setError("Problem statement is required");
      return;
    }
    setLoading(true);
    setError("");

    const sessionRes = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        problem_statement: problemStatement,
        max_rounds: maxRounds,
        temperature,
        persona_ids: selectedIds,
      }),
    });

    if (!sessionRes.ok) {
      setError("Failed to create session");
      setLoading(false);
      return;
    }

    const session = await sessionRes.json();

    const startRes = await fetch(`/api/sessions/${session.id}/start`, { method: "POST" });
    if (!startRes.ok) {
      const data = await startRes.json();
      setError(data.error || "Failed to start panel");
      setLoading(false);
      return;
    }

    router.push(`/sessions/${session.id}`);
  }

  const presets = [20, 50, 70, 100];

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div>
        <Label>Problem Statement</Label>
        <Textarea
          value={problemStatement}
          onChange={(e) => setProblemStatement(e.target.value)}
          rows={12}
          placeholder="Describe the problem for the panel to brainstorm..."
          className="font-mono text-sm"
          required
        />
      </div>

      <div>
        <Label>Personas (select at least 2)</Label>
        <div className="space-y-2 mt-2">
          {personas.map((p) => (
            <label key={p.id} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={selectedIds.includes(p.id)}
                onChange={() => togglePersona(p.id)}
              />
              <span className="font-medium text-sm">{p.name}</span>
              <span className="text-xs text-muted-foreground">— {p.role}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label>Rounds: {maxRounds}</Label>
        <div className="flex gap-2 mt-2">
          {presets.map((n) => (
            <Button
              key={n}
              type="button"
              variant={maxRounds === n ? "default" : "outline"}
              size="sm"
              onClick={() => setMaxRounds(n)}
            >
              {n}
            </Button>
          ))}
          <Input
            type="number"
            min={1}
            max={200}
            value={maxRounds}
            onChange={(e) => setMaxRounds(Number(e.target.value))}
            className="w-20"
          />
        </div>
      </div>

      <div>
        <Label>Temperature: {temperature.toFixed(2)}</Label>
        <input
          type="range"
          min={0.3}
          max={1.0}
          step={0.05}
          value={temperature}
          onChange={(e) => setTemperature(Number(e.target.value))}
          className="w-full mt-2"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? "Starting..." : "Start Panel"}
      </Button>
    </form>
  );
}
