<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Photo jobs are durable database rows awakened by insert/update webhooks, not browser-owned AI calls or permanent polling jobs, so processing survives leaving the app without idle Cloud work.
- Worker callbacks verify a per-job random capability before privileged access, atomically claim one leased job, and commit inventory plus completion in one database transaction to prevent duplicate books.
- Queue policy/credit/refusal pauses are persisted per user and require an explicit retry after recovery; never automatically replay uncertain AI outcomes.
- Both extraction paths use the shared photo-catalog helper and prompt so recognition, validation, and empty-result explanations stay consistent.
- The shared photo helper folds the optional magazine issue date into the inventory title and removes that extraction-only field before persistence, preserving the existing inventory schema.
- Source travels with the durable photo job and is copied transactionally into every resulting item; use the source-aware enqueue RPC while retaining the original RPC for published clients.
- Keep photo upload validation in the browser-safe photo queue module so its input contract can be tested independently of server execution.
- Completed zero-book jobs store their explanation in the existing error_message field before completion; display it separately from failures so empty results remain completed and never auto-retry.
- ISBN scans create inventory placeholders and durable webhook jobs in one transaction; token-verified leased workers update that same entry, so closing the scanner cannot lose accepted scans.
- ISBN catalogue matches must verify the exact normalized identifier; missing catalogue and series details are flagged for manual review rather than guessed.
- Load the barcode library dynamically after camera activation and release camera tracks on close; only beep after a scan is durably saved.

- The in-app barcode/ISBN scanner UI was removed at the user's request; ISBN data, column and backend job code remain so existing entries keep working.
