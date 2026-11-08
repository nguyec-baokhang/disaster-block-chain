# Demo inputs

Follows the demo script in [PLAN.md](../PLAN.md) section 13.

| File | Use on | Expected verdict |
|---|---|---|
| `1-publish-official.txt` | `/publish` | Confirmed Solana transaction |
| `2-twisted-forward.txt` | `/check` | `CONTRADICTED`, with differences listed |
| `3-same-reworded.txt` | `/check` | `VERIFIED_OFFICIAL` (official match) |
| `4-unknown-claim.txt` | `/check` | `UNVERIFIED` or `CONTRADICTED` (USGS has no record) |

Video: record your own short clip (≤ 30 s, 720p, under 20 MB) reading the advisory, publish it with alert 1, then re-encode it (for example, `ffmpeg -i clip.mp4 -crf 30 clip-reencoded.mp4`) and check the re-encoded copy. The file hash differs, so Gemini must watch it to reach `VERIFIED_OFFICIAL`. Video files aren't committed.

Tamper: edit one character of an alert's `body` in `data/alerts.json`, then click **Verify integrity**. It turns red, and the alert is no longer used for checks.
