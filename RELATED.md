# Related repositories

| Tree | Role |
|------|------|
| **NuvioTV** (vanilla / upstream target) | Product Android TV app. Honors [PACK_RUNTIME_CONTRACT.md](./PACK_RUNTIME_CONTRACT.md) on Netflix home. |
| **NuvioTV_Fork** (lab) | Bake-off / Debug Netflix binding. Prefer rebasing onto vanilla; do not ship the whole fork as the product. |
| **Nuvio_Reframe_Studio** (this repo) | Author packs (`*.view.json`). Never renders the TV. |

Studio must only promise controls listed as **Honored** in the pack runtime contract.

## Upstream packaging

1. Open PRs to real upstream from thin vanilla slices (pack schema + Netflix binding, then scales / collection open).
2. Docs for users: Layout settings → View pack import → home becomes Netflix with Studio-controlled rails / hero / focused-info.
3. Debug fork fate: temporary lab until vanilla proves; then rebase or retire duplicate Netflix port.
