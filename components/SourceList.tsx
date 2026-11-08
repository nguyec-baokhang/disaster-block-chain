import { ExternalLink } from "lucide-react";
import type { Source } from "@/lib/types";

export default function SourceList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) {
    return <p className="text-sm text-slate-400">No sources we can show you.</p>;
  }
  return (
    <ul className="space-y-2">
      {sources.map((s) => (
        <li key={s.uri}>
          <a
            href={s.uri}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-start gap-2 text-sky-300 hover:text-sky-200 hover:underline"
          >
            <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="break-words">{s.title}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
