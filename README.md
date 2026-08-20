# Nuvio Reframe Studio

Visual **home view** editor for vanilla [Nuvio TV](https://github.com/Tolu-Walop-E/Nuvio_Reframe).

Drag blocks onto a TV canvas, reorder them, and point each slot at a known Nuvio data source. Export or **Send to TV** a `view.json` pack. Vanilla Nuvio honors the [Pack Runtime Contract](./PACK_RUNTIME_CONTRACT.md) on **Netflix home** (order, hero, focused-info, rail scales, collection open). Studio never paints the TV.

## Relationship to Nuvio TV

| Repo | Role |
|------|------|
| **NuvioTV** (vanilla) | Android TV runtime — Netflix home + pack contract |
| **Nuvio_Reframe_Studio** (this repo) | Website to author view packs |
| NuvioTV_Fork | Optional lab only — not the product path |

See [RELATED.md](./RELATED.md). Inspector badges mark **Honored** vs **Preview only** fields.

## Pack format (v0)

```json
{
  "schemaVersion": 1,
  "id": "my-home",
  "name": "My Home",
  "canvas": { "width": 1920, "height": 1600 },
  "blocks": [
    {
      "id": "hero-1",
      "type": "hero",
      "x": 0,
      "y": 0,
      "w": 1920,
      "h": 620,
      "dataSource": "featured",
      "trailer": true
    }
  ]
}
```

`canvas` grows with content. A dashed **1920×1080** guide marks the first TV screen; rails/collections can sit below that and Nuvio scrolls into them.

## Nuvio account library

In the left rail, open **Nuvio account**:

1. Set your Supabase URL + anon/publishable key (same as the TV app `local.dev.properties`)
2. Sign in with email/password
3. Studio pulls profiles, collections (`sync_pull_collections`), and addon catalogs (addon URLs + `/manifest.json`)
4. Select a widget → **Data source** lists your real collections (`📁`) and catalogs (`🎬`)

Optional defaults: copy `.env.example` → `.env.local`.

## Scripts

- `npm run dev` — local studio
- `npm run build` — production build
- `npm run preview` — preview build
