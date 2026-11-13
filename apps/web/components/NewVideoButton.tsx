"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Project } from "@stages/project";
import { api, track } from "@/lib/client";

export function NewVideoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-primary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const p = await api<Project>("/api/projects", { method: "POST" });
          track("project_created", { projectId: p.id });
          router.push(`/p/${p.id}?step=song`);
        } catch {
          setBusy(false);
        }
      }}
    >
      {busy ? "Creating…" : "New video"}
    </button>
  );
}
