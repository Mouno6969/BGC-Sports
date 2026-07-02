# BGC Sports — Live Sports Watch Party

A full-stack, real-time **live sports watch party** web app. Watch a synchronized
live stream together, chat publicly without an account, and create private
**watch party rooms** with a 6-character code for a group video/audio call —
all in a minimal, dark, sports-style UI.

> **Status:** MVP complete and locally verified (HLS playback, public chat,
> room creation, host sync control, admin panel, mobile-responsive layout).
> Group calls use **LiveKit** as the SFU and activate automatically once LiveKit
> credentials are provided.

---

## Table of Contents

1. [Features](#features)
2. [Toffee Live Integration](#toffee-live-integration) ← **New**
3. [Architecture](#architecture)
4. [Tech Stack](#tech-stack)
5. [Repository Layout](#repository-layout)
6. [Quick Start (Local Dev)](#quick-start-local-dev)
7. [Environment Variables](#environment-variables)
8. [LiveKit Setup (Group Calls)](#livekit-setup-group-calls)
9. [Admin Panel](#admin-panel)
10. [How Sync Works](#how-sync-works)
11. [Deployment](#deployment)
12. [API & Socket Reference](#api--socket-reference)
13. [Troubleshooting](#troubleshooting)

---

## Features

### 1. Live Stream Viewing
- Plays a live stream via **HLS.js** (`.m3u8`), or embeds **YouTube** / **Twitch**.
- The active stream is global and **admin-controlled** — update it from the dashboard
  and the change is **broadcast in real time** to every connected viewer.
- In a room, the **host's** play/pause/seek is broadcast to all participants.

### 2. Public Live Chat
- Join and chat **without registration** — pick a guest name or get an auto-generated one.
- Real-time messages over **WebSockets (Socket.IO)**.
- **Emoji reactions**, basic **text formatting** (`*bold*`, `_italic_`).
- **Message timestamps** and **per-user colors**; live "online" count.

### 3. Private Watch Party (Group Video/Audio Call)
- Create a room → get a unique **6-character code** (e.g. `XK92PQ`).
- Others join by entering the code or via a shareable `?room=CODE` link — **no account**.
- Group **video + audio** call via **WebRTC**, scaled through **LiveKit** (SFU).
- Participants appear in a **floating grid** beside the stream.
- **Mute/unmute**, **camera on/off**, **leave** controls.
- **Host** can **kick** participants and **lock** the room.

### 4. Room Sync
- All participants share the **same stream timestamp**; the host controls playback.
- **"Sync to host"** button re-aligns any participant who drifts.

### 5. Toffee Live (New)
- Access popular Bangladeshi live channels from Toffee directly inside BGC-Sports.
- Streams are automatically fetched with the correct headers for reliable playback.
- Dedicated **"Toffee Live"** tab on the homepage with beautiful channel grid.

---

## Toffee Live Integration

BGC-Sports now includes native support for **Toffee** (toffeelive.com) streams.

### How it works
- Backend periodically fetches fresh channel data + required headers from the public bypass repository.
- Frontend Player automatically injects the necessary headers using `Hls.js` `xhrSetup`.
- No extra configuration needed.

### API
```http
GET /api/toffee/channels
```
Returns a list of channels with `url` and `headers` object.

### Usage in Frontend
```jsx
// The Player component already supports custom headers
<Player stream={{ url, type: 'hls', headers: channel.headers }} />
```

The homepage now has a dedicated **Toffee Live** tab with a beautiful grid of live channels.

---

## Architecture

```
                 ┌─────────────────────────────────────────────┐
                 │                  Browser (React)             │
                 │  Player · Chat · Room · VideoCall · Admin    │
                 └───────┬──────────────────┬──────────────────┘
                         │ Socket.IO        │ HTTPS (REST)        │ WebRTC media
                         │ (chat/signaling) │ (token, stream,     │ (audio/video)
                         ▼                  │  admin, toffee)     ▼
                 ┌───────────────────────────────────┐   ┌──────────────────┐
                 │  Node + Express + Socket.IO       │   │   LiveKit (SFU)  │
                 │  rooms · chat · host-sync · admin │──▶│  token-authed    │
                 │  toffee fetcher · in-memory store │   │  rooms (≤8)      │
                 └───────────────────────────────────┘   └──────────────────┘
```

---

## Tech Stack

| Layer        | Technology                                                        |
|--------------|-------------------------------------------------------------------|
| Frontend     | React 19, Vite, Tailwind CSS, HLS.js, socket.io-client, livekit-client |
| Backend      | Node.js, Express, Socket.IO, `livekit-server-sdk`                 |
| Realtime     | WebSockets (chat + signaling), WebRTC via LiveKit SFU             |
| State        | In-memory store (Redis-ready)                                     |
| Deployment   | Vercel (frontend), VPS + systemd + Nginx (backend), LiveKit Cloud / Docker (SFU) |

---

## Repository Layout

```
BGC-Sports/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── config/index.js
│   │   ├── routes/
│   │   │   ├── api.js             # includes /api/toffee/channels
│   │   │   └── admin.js
│   │   ├── sockets/
│   │   ├── utils/
│   │   │   └── toffeeService.js   # NEW - Toffee integration
│   │   └── data/
│   └── deploy/
└── frontend/
    ├── src/
    │   ├── components/
    │   │   └── ToffeeSection.jsx  # NEW
    │   ├── pages/
    │   │   └── HomePage.jsx       # Toffee tab added
    │   └── lib/
    └── vercel.json
```

---

## Quick Start (Local Dev)

**Prerequisites:** Node.js 20+ and `pnpm` (or npm).

### 1. Backend

```bash
cd backend
cp .env.example .env          # then edit values
pnpm install
pnpm dev                      # starts on http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env          # set VITE_BACKEND_URL=http://localhost:4000
pnpm install
pnpm dev                      # starts on http://localhost:5173
```

Open `http://localhost:5173`. Go to the **Toffee Live** tab to see live channels.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable             | Required | Default                  | Description                                            |
|----------------------|----------|--------------------------|--------------------------------------------------------|
| `PORT`               | no       | `4000`                   | HTTP/WS port                                           |
| `CORS_ORIGIN`        | no       | `*`                      | Allowed frontend origin(s), comma-separated            |
| `ADMIN_PASSWORD`     | **yes**  | `changeme-admin-password`| Password for the admin panel — **change in production**|
| `DEFAULT_STREAM_URL` | no       | Big Buck Bunny HLS       | Initial stream URL                                     |
| `DEFAULT_STREAM_TYPE`| no       | `hls`                    | `hls` \| `youtube` \| `twitch`                         |
| `LIVEKIT_URL`        | no\*     | —                        | LiveKit server URL (`wss://…`)                         |
| `LIVEKIT_API_KEY`    | no\*     | —                        | LiveKit API key                                        |
| `LIVEKIT_API_SECRET` | no\*     | —                        | LiveKit API secret                                     |

\* Required only to enable group video/audio calls.

### Frontend (`frontend/.env`)

| Variable            | Required | Description                                             |
|---------------------|----------|---------------------------------------------------------|
| `VITE_BACKEND_URL`  | **yes**  | Backend base URL (e.g. `http://localhost:4000` or your API domain) |
| `VITE_LIVEKIT_URL`  | no       | LiveKit URL; if omitted the client uses the value the backend returns with each token |

---

## LiveKit Setup (Group Calls)

You can use **LiveKit Cloud (free tier)** or **self-host** with Docker.

### Option A — LiveKit Cloud
1. Create a project at <https://cloud.livekit.io>.
2. Copy the **WebSocket URL**, **API Key**, and **API Secret**.
3. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in `backend/.env`.

### Option B — Self-host (Docker)
```bash
cd backend/deploy
# edit livekit.yaml: set your keys + domain, then:
docker compose -f livekit-docker-compose.yml up -d
```
Point `LIVEKIT_URL` at your server (e.g. `wss://livekit.yourdomain.com`).

Once keys are present, the **"Join video call"** button activates automatically.

---

## Admin Panel

Visit `/admin`, log in with `ADMIN_PASSWORD`, then set the **Stream URL** and
**type** (`hls` / `youtube` / `twitch`). Saving **broadcasts the new stream to
every connected viewer instantly** via Socket.IO. The password is verified by the
backend and sent as an `x-admin-password` header on each update.

---

## How Sync Works

- The **host** of a room emits `room:playback` (`play` / `pause` / `seek` + current
  time) whenever they control the player.
- The backend relays it to all other participants, who apply it to their player.
- A participant can press **"Sync to host"** to request the host's latest state
  (`room:sync-request` → host replies with current position).
- A small drift threshold avoids feedback loops from minor timestamp differences.

---

## Deployment

### Frontend → Vercel
1. Import the repo in Vercel; set **Root Directory** to `frontend/`.
2. Build command `pnpm build`, output `dist` (auto-detected for Vite).
3. Add env var `VITE_BACKEND_URL=https://api.yourdomain.com`.
4. `vercel.json` already handles SPA route rewrites.

### Backend → VPS (Ubuntu + systemd + Nginx)
```bash
# on the server
git clone https://github.com/Mouno6969/BGC-Sports.git
cd BGC-Sports/backend
cp .env.example .env && nano .env      # set ADMIN_PASSWORD, LiveKit keys, CORS_ORIGIN
pnpm install --prod

# systemd
sudo cp deploy/bgc-sports.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now bgc-sports

# nginx (WebSocket-aware reverse proxy)
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/bgc-sports
sudo ln -s /etc/nginx/sites-available/bgc-sports /etc/nginx-sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# then add HTTPS, e.g.:  sudo certbot --nginx -d api.yourdomain.com
```

---

## API & Socket Reference

### REST
| Method | Path                        | Auth                | Description                                      |
|--------|-----------------------------|---------------------|--------------------------------------------------|
| GET    | `/api/health`               | —                   | Status + LiveKit + Toffee flags                  |
| GET    | `/api/stream`               | —                   | Current stream `{ url, type }`                   |
| GET    | `/api/toffee/channels`      | —                   | Toffee channels + required headers (NEW)         |
| POST   | `/api/admin/login`          | body `{password}`   | Verify admin password                            |
| POST   | `/api/admin/stream`         | header `x-admin-password` | Update + broadcast stream               |
| POST   | `/api/livekit/token`        | body `{roomCode, identity}` | Mint a LiveKit access token             |

### Socket.IO events
| Event                | Direction | Payload                                  |
|----------------------|-----------|------------------------------------------|
| `chat:join`          | C→S       | `{ username }`                           |
| `chat:message`       | C↔S       | `{ text }` / broadcast `{ id, user, color, text, ts }` |
| `room:create`        | C→S       | `{ username }` → `{ room }`              |
| `room:join`          | C→S       | `{ code, username }` → `{ room }` / error|
| `room:leave`         | C→S       | —                                        |
| `room:participants`  | S→C       | `[{ id, username, color }]`             |
| `room:playback`      | C↔S       | `{ action, time }` (host → others)      |
| `room:sync-request`  | C↔S       | participant asks host for current time   |
| `room:lock`          | C→S       | `{ locked }` (host only)                 |
| `room:kick`          | C→S       | `{ id }` (host only)                     |
| `stream:update`      | S→C       | `{ url, type }` (admin broadcast)        |

---

## Troubleshooting

- **Group call button disabled:** LiveKit env vars not set on the backend. Add
  `LIVEKIT_URL/API_KEY/API_SECRET` and restart.
- **Chat/room not connecting:** check `VITE_BACKEND_URL` and that Nginx forwards
  the `Upgrade`/`Connection` headers (the provided config does).
- **CORS errors:** set `CORS_ORIGIN` to your exact frontend origin in production.
- **YouTube/Twitch won't embed:** some streams block embedding; use an HLS URL or
  an embeddable source.
- **Toffee streams not playing:** Make sure you're using the `/api/toffee/channels` endpoint and passing the `headers` object to the player.

---

## License

MIT — use freely for your BGC Sports watch parties.
