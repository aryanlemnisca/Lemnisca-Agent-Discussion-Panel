"use client";

import { Button } from "@/components/ui/button";
import type { Message, Persona, Synthesis } from "@/lib/types";

interface Props {
  sessionId: string;
  messages: Message[];
  synthesis: Synthesis | null;
  personas: Persona[];
}

export function ExportButtons({ sessionId, messages, synthesis, personas }: Props) {
  const personaMap = Object.fromEntries(personas.map((p) => [p.id, p.name]));

  function downloadMarkdown(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadTranscript() {
    const lines = messages.map((m) => {
      const name = personaMap[m.persona_id] || "Unknown";
      return `### [${m.turn_number}] ${name}\n\n${m.content}\n\n---\n`;
    });
    downloadMarkdown("transcript.md", `# Discussion Transcript\n\n${lines.join("\n")}`);
  }

  function downloadSynthesis() {
    if (synthesis) {
      downloadMarkdown("synthesis.md", `# Synthesis Report\n\n${synthesis.content}`);
    }
  }

  function copyShareLink() {
    const url = `${window.location.origin}/shared/${sessionId}`;
    navigator.clipboard.writeText(url);
  }

  async function downloadPdf() {
    if (!synthesis) return;
    const html2pdf = (await import("html2pdf.js")).default;
    const el = document.getElementById("synthesis-content");
    if (el) {
      html2pdf().set({ margin: 1, filename: "synthesis.pdf" }).from(el).save();
    }
  }

  return (
    <div className="flex gap-2 flex-wrap">
      <Button variant="outline" size="sm" onClick={downloadTranscript}>
        Download Transcript (.md)
      </Button>
      {synthesis && (
        <>
          <Button variant="outline" size="sm" onClick={downloadSynthesis}>
            Download Synthesis (.md)
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf}>
            Download Synthesis (.pdf)
          </Button>
        </>
      )}
      <Button variant="outline" size="sm" onClick={copyShareLink}>
        Copy Share Link
      </Button>
    </div>
  );
}
