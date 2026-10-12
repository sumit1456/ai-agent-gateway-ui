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
- For a non-Docker Vite build, set `VITE_API_URL` in a `.env` file. The Docker image instead routes API calls through Nginx and reads `BACKEND_URL` at container startup; see Docker runtime configuration below.

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
# Docker runtime configuration

The frontend container reads `BACKEND_URL` from its environment at startup and
uses it for the Nginx API and SSE proxy. Copy `.env.example` to `.env`, set the
address that is reachable from the frontend container, and pass the file to
Docker when starting the image:

```sh
docker run --env-file .env -p 3000:80 <dockerhub-user>/ai-agent-gateway-ui:<tag>
```

For containers on the same Docker network, `BACKEND_URL` can use the backend
service name, such as `http://backend:8000`.
