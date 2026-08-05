# Nuvio Reframe Studio

Visual **home view** editor for [Nuvio TV](https://github.com/Tolu-Walop-E/Nuvio_Reframe).

Drag blocks onto a TV canvas, resize them, and point each slot at a known Nuvio data source. Export a `view.json` pack. Nuvio renders packs with its native Compose components (focus + trailers stay in the app).

## Relationship to Nuvio TV

| Repo | Role |
|------|------|
| [Nuvio_Reframe](https://github.com/Tolu-Walop-E/Nuvio_Reframe) | Android TV app (Compose renderer, data, TrailerPlayer) |
| **Nuvio_Reframe_Studio** (this repo) | Website to author view packs |

**Zero required changes to Nuvio TV to start designing.**  
Later, Nuvio can load a pack by one layout id/tag. Until then, packs are design output only.

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
