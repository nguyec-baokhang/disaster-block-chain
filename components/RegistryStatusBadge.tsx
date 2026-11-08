import { Ban, CircleCheck, RefreshCw } from "lucide-react";
import type { RegistryStatus } from "@/lib/types";

const STATUS: Record<RegistryStatus, { label: string; icon: typeof Ban; className: string }> = {
  Active: { label: "Active", icon: CircleCheck, className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  Retracted: { label: "Retracted by agency", icon: Ban, className: "border-red-500/40 bg-red-500/10 text-red-300" },
  Superseded: { label: "Superseded", icon: RefreshCw, className: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
};

export default function RegistryStatusBadge({ status }: { status: RegistryStatus }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {s.label}
    </span>
  );
}
