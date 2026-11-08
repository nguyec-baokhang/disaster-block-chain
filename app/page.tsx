import Link from "next/link";
import { ArrowRight, Link2, Megaphone, Search } from "lucide-react";

const STEPS = [
  {
    icon: Megaphone,
    title: "Agencies publish",
    text: "An emergency agency issues an alert through CrisisSignal.",
  },
  {
    icon: Link2,
    title: "Signed on Solana",
    text: "A fingerprint of the alert is recorded on-chain, signed by the agency's own wallet.",
  },
  {
    icon: Search,
    title: "Public checks",
    text: "Anyone can paste a message or upload a clip to see if the agency really said it.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
      <section className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
          Did they actually say it?
        </h1>
        <p className="mt-4 text-lg text-slate-300">
          During a crisis, fake and twisted alerts spread fast. CrisisSignal checks a message against what the
          responsible agency actually published.
        </p>
        <Link
          href="/check"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-3 font-medium text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          Check a message
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>

      <section aria-labelledby="how-it-works" className="mt-20">
        <h2 id="how-it-works" className="text-sm font-medium uppercase tracking-wider text-slate-400">
          How it works
        </h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="rounded-xl border border-navy-700 bg-navy-900 p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-800 text-sky-400">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="text-sm text-slate-400">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 font-medium text-slate-50">{title}</h3>
              <p className="mt-1 text-sm text-slate-300">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
