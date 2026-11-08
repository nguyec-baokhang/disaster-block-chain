// Imports up to 3 live NWS alerts (Ohio, Hamilton County first; KY/IN if Ohio has none)
// and publishes each on Solana Devnet, signed by the nws-cin wallet.
// Usage: npx tsx --env-file=.env.local scripts/import-nws.ts
import { importNwsAlerts } from "../lib/nws";

async function main() {
  const { areas, found, skipped, imported } = await importNwsAlerts();
  console.log(`Areas: ${areas.join(", ")} · active alerts: ${found} · already imported: ${skipped}`);
  if (imported.length === 0) console.log("Nothing new to import.");
  for (const a of imported) {
    console.log(`\n${a.id} [${a.chainStatus}] ${a.title}`);
    console.log(`  source:   ${a.sourceUrl}`);
    console.log(`  explorer: ${a.explorerUrl ?? "(no confirmed transaction)"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
