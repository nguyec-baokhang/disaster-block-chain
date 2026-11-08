// Items look like "Instruction changed: boil water → evacuate"; anything else renders as plain text.
const DIFF_PATTERN = /^(.+?):\s*(.+?)\s*→\s*(.+)$/;

export default function DiffList({ differences }: { differences: string[] }) {
  if (differences.length === 0) return null;
  return (
    <ul className="space-y-2">
      {differences.map((d, i) => {
        const m = DIFF_PATTERN.exec(d);
        return (
          <li key={i} className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm">
            {m ? (
              <>
                <span className="font-medium text-slate-200">{m[1]}:</span>{" "}
                <span className="text-slate-400 line-through decoration-red-400/70">{m[2]}</span>
                <span className="mx-2 text-slate-500" aria-label="changed to">→</span>
                <span className="font-semibold text-red-300">{m[3]}</span>
              </>
            ) : (
              <span className="text-slate-200">{d}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
