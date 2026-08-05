# Related repositories

- **Nuvio TV (fork):** https://github.com/Tolu-Walop-E/Nuvio_Reframe  
  Android TV app. Renders view packs with native Compose. No Studio dependency for local app builds.

- **This repo:** Nuvio Reframe Studio  
  Author packs (`*.view.json`) offline. Nuvio TV can later select a pack by one layout id.

Studio does **not** modify the Nuvio TV tree. Keep changes to the TV app minimal and only when wiring pack loading.
