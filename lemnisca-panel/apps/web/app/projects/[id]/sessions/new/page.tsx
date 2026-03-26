"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { SessionConfigForm } from "@/components/session-config-form";
import type { Persona } from "@/lib/types";

export default function NewSessionPage() {
  const { id } = useParams<{ id: string }>();
  const [personas, setPersonas] = useState<Persona[]>([]);

  useEffect(() => {
    fetch(`/api/personas?project_id=${id}`).then((r) => r.json()).then(setPersonas);
  }, [id]);

  return (
    <div className="max-w-5xl mx-auto p-8">
      <Link href={`/projects/${id}`} className="text-sm text-muted-foreground hover:underline">
        &larr; Back to project
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-6">New Session</h1>
      {personas.length < 2 ? (
        <p className="text-muted-foreground">
          You need at least 2 personas in this project to start a session.{" "}
          <Link href={`/projects/${id}`} className="underline">Add personas first.</Link>
        </p>
      ) : (
        <SessionConfigForm projectId={id} personas={personas} />
      )}
    </div>
  );
}
