# Agora Dashboard

## 1. Intro

Agora Dashboard is a small server-rendered web app (PWA) for observing agora-hub's machines and deployments and switching them on/off or starting/stopping them. It keeps no state of its own: every view and action goes through the hub's admin API.

## 2. Quick install

Clone:

```sh
git clone <repository-url> agora-dashboard
cd agora-dashboard
```

Configure (use the same admin token as agora-hub):

```sh
CONFIG_DIR="$HOME/.config/agora/agora-dashboard"
mkdir -p "$CONFIG_DIR" && chmod 700 "$CONFIG_DIR"
cp .env.example "$CONFIG_DIR/.env" && chmod 600 "$CONFIG_DIR/.env"
# edit it: AGORA_HUB_URL=http://127.0.0.1:3333 natively,
#          http://host.docker.internal:3333 in Docker; and the hub's token
```

Native (Node 24):

```sh
npm ci && npm run build
node --env-file="$HOME/.config/agora/agora-dashboard/.env" \
  node_modules/@react-router/serve/bin.cjs ./build/server/index.js
```

Docker:

```sh
make build
docker run --rm --name agora-dashboard \
  --publish 4444:4444 \
  --env-file "$HOME/.config/agora/agora-dashboard/.env" \
  agora-dashboard:local
```

Open `http://<host>:4444`. For development without a real hub, run `npm run fake-hub` (port 3334) and `npm run dev` with `.env.example` copied to `.env`.

## 3. Configuration

| Variable | Meaning |
| --- | --- |
| `AGORA_HUB_URL` | agora-hub base URL (`http://127.0.0.1:3333` native, `http://host.docker.internal:3333` in Docker) |
| `AGORA_HUB_ADMIN_TOKEN` | The hub's 64-hex admin token; stays on the server |
| `PORT` | Listen port, default `4444` |

The app refuses to start if the URL or token is missing or malformed.

Icons: replace the placeholders in `public/icons/` with files of the same name and size, then rebuild. `icon-192.png` (192×192), `icon-512.png` (512×512) and `icon-maskable-512.png` (512×512, content inside the safe zone) are referenced by `public/manifest.webmanifest`; `apple-touch-icon.png` (180×180) and `favicon.svg` are linked from the page head.

## 4. Install as an app

- macOS Safari: open the dashboard, then *File → Add to Dock*.
- iOS Safari: open the dashboard, then *Share → Add to Home Screen*.

It opens standalone with the Agora icon. The dashboard is served over plain HTTP without a service worker, so Chrome will not offer to install it.
