# Evidence checklist — staging `get_ziro_context`

Save under a single folder (e.g. `evidence/staging-get-star-context-<date>/`).

| # | Artifact | Filename |
|---|----------|----------|
| 1 | `pg_get_functiondef` before migrate | `rollback_get_ziro_context.sql` (filled template) |
| 2 | Grants query output before | `grants-before.txt` |
| 3 | `pg_get_functiondef` after migrate | `get_ziro_context-after.sql` |
| 4 | Grants query output after | `grants-after.txt` |
| 5 | Applied migration body (git SHA or copy) | `migration-applied.txt` |
| 6 | Owner RPC JSON or error | `persona-owner.json` |
| 7 | Admin RPC | `persona-admin.json` |
| 8 | Studio director RPC | `persona-studio_director.json` |
| 9 | Teacher RPC | `persona-teacher.json` |
| 10 | Parent RPC (error ok pre-splice) | `persona-parent.txt` |
| 11 | Tenant mismatch error | `persona-tenant-mismatch.txt` |
| 12 | Star UI owner screenshot | `ui-star-owner.png` |
| 13 | Star UI teacher screenshot | `ui-star-teacher.png` |
| 14 | Signoff | `staging-signoff.txt` (from template) |

Optional: `failures.txt` for any unexpected errors during run.
