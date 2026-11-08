import { CircleCheck, ShieldCheck, ShieldX, TriangleExclamationPoint, type LucideIcon } from "lucide-react";
import type { Verdict } from "@/lib/types";

const VERDICTS: Record<Verdict, { label: string; icon: LucideIcon; className: string; note?: string }> = {
  VERIFIED_OFFICIAL: {
    label: "Verified official",
    icon: ShieldCheck,
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  CONTRADICTED: {
    label: "Contradicted",
    icon: ShieldX,
    className: "border-red-500/40 bg-red-500/10 text-red-300",
  },
  SUPPORTED: {
    label: "Supported by sources",
    icon: CircleCheck,
    className: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  },
  UNVERIFIED: {
    label: "Unverified",
    icon: TriangleExclamationPoint,
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    note: "Don't share this as confirmed.",
  },
};

// `compact` is a small pill for lists; the default is the large result-page badge.
export default function VerdictBadge({ verdict, compact = false }: { verdict: Verdict; compact?: boolean }) {
  const { label, icon: Icon, className, note } = VERDICTS[verdict];
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {label}
      </span>
    );
  }
  return (
    <div className={`inline-flex flex-col gap-1 rounded-xl border px-4 py-3 ${className}`}>
      <span className="flex items-center gap-2 text-lg font-semibold">
        <Icon className="h-6 w-6 shrink-0" aria-hidden />
        {label}
      </span>
      {note && <span className="text-sm font-medium">{note}</span>}
    </div>
  );
}
