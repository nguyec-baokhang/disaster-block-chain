import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import ResultView from "./ResultView";

// The id is only known at request time, so the client view (which reads it with
// useParams) must sit inside Suspense under Cache Components.
export default function ResultPage() {
  return (
    <Suspense fallback={<ResultLoading />}>
      <ResultView />
    </Suspense>
  );
}

function ResultLoading() {
  return (
    <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-14 text-slate-300">
      <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
      Loading result…
    </div>
  );
}
