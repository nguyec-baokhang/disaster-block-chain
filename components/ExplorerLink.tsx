import { ExternalLink } from "lucide-react";

export default function ExplorerLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm text-sky-300 hover:text-sky-200 hover:underline"
    >
      View on Solana Explorer
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  );
}
