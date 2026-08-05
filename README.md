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
  "canvas": { "width": 1920, "height": 1080 },
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

Allowed block types and data sources live in `src/catalog/`.

## Develop

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` — local studio
- `npm run build` — production build
- `npm run preview` — preview build
