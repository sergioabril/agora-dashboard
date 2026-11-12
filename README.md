# Agora Dashboard

## 1. Intro

Agora Dashboard is a small server-rendered web app (PWA) for observing agora-hub's machines and deployments, switching them on/off or starting/stopping them, adding and editing machines, adding and editing deployments, and configuring the hub's Home Assistant integration on a settings page. Deployment logs stream live while a deployment starts or stops. It keeps no state of its own: every view and action goes through the hub's admin API.

## 2. Quick install

It needs an agora-hub with the streamed-deployments API (FEATURE-HUB: NDJSON start/stop and `GET /admin/deployments/{id}/output`).

Clone:

```sh
git clone <repository-url> agora-dashboard
cd agora-dashboard
```

Docker (the only supported way to run the image):

```sh
make deploy
```

`make deploy` creates `~/.config/agora/agora-dashboard/` (mode `0700`, and any missing parent folder) and, only if it is missing, `.env` (mode `0600`) from the defaults: `AGORA_HUB_URL=http://host.docker.internal:3333` and no token. Without flags it never overwrites an existing `.env`. It then builds the image and starts the dashboard in the background on port `4444`, with the config folder mounted read-only at `/config`. The container uses `--restart unless-stopped`, so it comes back after a crash, a Docker restart or a reboot. Run `make deploy` again to rebuild and replace it. Use `make deploy CONFIG_DIR=/other/path` for a different folder.

Logs: `docker logs -f agora-dashboard`. Undeploy: `docker rm -f agora-dashboard`.

Hook it to agora-hub:

```sh
make deploy                                      # hub on this machine, no token
make deploy HUB_HOST=192.168.1.20                # hub on another machine
make deploy HUB_TOKEN=<the hub's api.admin_token>
make deploy HUB_HOST=192.168.1.20 HUB_TOKEN=<the hub's api.admin_token>
```

The flags are saved into `~/.config/agora/agora-dashboard/.env` (created first if missing), replacing only those values; later runs without flags keep them. `HUB_HOST` takes an IP or hostname only (no scheme, no port), and the hub is expected on port `3333`. Never use `127.0.0.1` or `localhost`: inside the container they point at the dashboard itself. For a hub on the same machine, leave `HUB_HOST` out. To go back to the defaults, pass `HUB_TOKEN=REPLACE_WITH_HUB_TOKEN` and `HUB_HOST=host.docker.internal`. Alternatively, edit `.env` by hand and run `docker restart agora-dashboard`; the app re-reads `/config/.env` on every start.

Token: agora-hub's `api.admin_token` is either empty (no authentication, the default after the hub's `make deploy`) or 64 hex characters. If it is empty, leave `AGORA_HUB_ADMIN_TOKEN=REPLACE_WITH_HUB_TOKEN` in `~/.config/agora/agora-dashboard/.env`, and the dashboard sends no token. If it is set, run `make deploy HUB_TOKEN=<that value>`, or put it in `AGORA_HUB_ADMIN_TOKEN` and run `docker restart agora-dashboard`. A mismatch shows **HUB REJECTED TOKEN**. The dashboard has no login of its own: anyone who can open port `4444` can control the hub through it.

Native (Node 24), as an alternative to Docker. Copy `.env.example` into the config folder, set `AGORA_HUB_URL=http://127.0.0.1:3333` and the token as above (the `make deploy` flags don't apply here: edit the file by hand):

```sh
CONFIG_DIR="$HOME/.config/agora/agora-dashboard"
mkdir -p "$CONFIG_DIR" && chmod 700 "$CONFIG_DIR"
cp .env.example "$CONFIG_DIR/.env" && chmod 600 "$CONFIG_DIR/.env"
npm ci && npm run build
node --env-file="$CONFIG_DIR/.env" node_modules/@react-router/serve/bin.cjs ./build/server/index.js
```

Docker and native share this one `.env`, with different `AGORA_HUB_URL` values (`http://host.docker.internal:3333` in Docker, `http://127.0.0.1:3333` natively). If you switch, change the URL: `make deploy` never rewrites an existing file.

Open `http://<host>:4444`. For development without a real hub, run `npm run fake-hub` (port 3334) and `npm run dev` with `.env.example` copied to `.env`.

## 3. Configuration

| Variable | Meaning |
| --- | --- |
| `AGORA_HUB_URL` | agora-hub base URL (`http://host.docker.internal:3333` in Docker, `http://127.0.0.1:3333` native) |
| `AGORA_HUB_ADMIN_TOKEN` | `REPLACE_WITH_HUB_TOKEN` (the default) or empty: no token is sent, for a hub with an empty `api.admin_token`. Otherwise the hub's exact 64-hex `api.admin_token`, sent as `Authorization: Bearer <token>`; it stays on the server |
| `PORT` | Native only: listen port, default `4444` (Docker always uses `4444`) |

The app refuses to start if the URL is missing or malformed, or if the token is anything other than the values above (the value is never printed).

In the add form, **test ssh** asks the hub to try the SSH login with the entered host, port, user and password or key, without saving the machine; the result shows in the form. A newly added machine needs no extra step: the hub trusts its SSH host key on the first connection. If a machine's key changes later (for example after a reinstall), its card shows **auth error** until the old key is removed from the hub's `known_hosts` (see the agora-hub README).

**Edit host**: click a machine card's art to edit that host (locked while the hub is offline or the machine has an operation running). The form is prefilled from the hub; `password` and `sudo_password` start blank, and a blank one keeps the saved password. A cleared optional field goes back to its default (a blank `port` saves as 22). There is no **test ssh** when editing: the dashboard never sees saved passwords.

**Add/edit deployment**: **+ add deployment** (after the deployment cards) opens a form; click a deployment card's topology art to edit it. Fields: `name`; `machines`, a checklist of every host (offline ones too; Space toggles, ↑/↓ move); `head`, picked from the checked machines (the first one you check becomes head, unchecking the head clears it until you pick another); `start_command` and `stop_command`, an absolute path that may take arguments and runs on the head from the SSH user's home; and `endpoint`, the full URL the hub GETs to probe it (any 2xx = up). There is no test button; the hub validates on save and its message shows in the form. Editing is locked while the deployment starts or stops.

**Deployment log**: a deployment card's **log** shows the hub's output line by line (`hub│` hub steps, `out│` stdout, `err│` stderr) live while the deployment starts or stops, and replays the whole log after a reload. Your own start or stop opens the drawer by itself. If your own start or stop fails and the deployment ends up stopped, the card shows a red **failed** until the page is reloaded.

**Settings → integrations → home assistant** opens a form for the hub's Home Assistant `host`, `port` and token. **test** checks the connection without saving; **save** writes it to the hub's `hub.yaml`, and an empty token turns the integration off. While it's online, **switches** on the box lists Home Assistant's `switch.*` entities, their state and the machines plugged into them (read-only). The token is shown in the form, so anyone who can open port `4444` can read it.

Icons: replace the placeholders in `public/icons/` with files of the same name and size, then rebuild. `icon-192.png` (192×192), `icon-512.png` (512×512) and `icon-maskable-512.png` (512×512, content inside the safe zone) are referenced by `public/manifest.webmanifest`; `apple-touch-icon.png` (180×180) and `favicon.svg` are linked from the page head.

## 4. Install as an app

- macOS Safari: open the dashboard, then *File → Add to Dock*.
- iOS Safari: open the dashboard, then *Share → Add to Home Screen*.

It opens standalone with the Agora icon. The dashboard is served over plain HTTP without a service worker, so Chrome will not offer to install it.
