"use client";

import { useState } from "react";

export default function Download({ filename, data, getData, label = "Download JSON" }: { filename: string; data?: unknown; getData?: () => Promise<unknown>; label?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  return <span><button disabled={pending} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50" onClick={async () => {
    setPending(true); setError(undefined);
    try {
      const value = getData ? await getData() : data;
      const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Download failed. Try again."); }
    finally { setPending(false); }
  }}>{pending ? "Preparing download…" : label}</button>{error && <span role="alert" className="mt-2 block text-sm">{error} Use the export button to retry.</span>}</span>;
}
