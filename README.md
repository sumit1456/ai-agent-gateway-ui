# Agent Gateway — Frontend

Horizon landing + registration UI built with React and Vite.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` (or `npm start`) | Dev server on http://localhost:3000 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run tests once (Vitest + jsdom) |

## Setup

- Dev proxy: `/auth`, `/v1`, `/health` are forwarded to `http://localhost:8000` (the FastAPI gateway) — configured in `vite.config.js`.
- To point the API elsewhere (e.g. production), set `VITE_API_URL` in a `.env` file: `VITE_API_URL=https://api.example.com`

## Structure

```
index.html            # Vite entry (fonts, meta, #root)
vite.config.js        # React plugin, dev proxy, Vitest config
src/
  main.jsx            # React bootstrap
  App.jsx             # Hash router: #/ landing, #/register
  api.js              # API client (auth endpoints)
  pages/              # Landing, Register
  components/         # Nav, Footer, BlackHole (hero canvas), Reveal
```
