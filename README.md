# Life-Companion-App
A test project to simplify life management with AI code, it offers offline mode. search providers, profile sharing and comparing, activity management and shedule. private stock control, cooking reciepes, etc.

## Development

Requirements-spec and design documents live in `docs/` (Lastenheft, Datenmodell, Proxy-API, Test-Katalog).

```bash
npm install   # Abhängigkeiten
npm test      # Vitest (L1 Unit + L2 DB-Integration, TC-ENE/TC-DBC)
npm run typecheck
npm start     # Expo Dev-Server (Android-first)
```

Architecture: React Native + Expo + TypeScript, MVVM (Views → ViewModels → UseCases → Repositories → DAOs); local SQLite databases are created from `migrations/` + `seed/` (one database per profile, FA-851/852).
