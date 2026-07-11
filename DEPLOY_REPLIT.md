# Deploying Legends of Sherwood on Replit

The game is a single Node.js process that serves the browser client **and** runs the
authoritative WebSocket world on one port. It's built to run as a persistent server with
durable, backed-up player data.

## 1. Import the project

In Replit: **Create → Import from GitHub** and paste the repository URL. Replit reads the
included `.replit` / `replit.nix` and installs Node 20 automatically. (Or drag the folder in.)

Press **Run**. The client is served at your Repl's web URL; players connect over WebSockets to
the same origin, so nothing else needs configuring.

## 2. Make it a persistent, always-on server

For a live game you want the world process to stay up and the data disk to persist:

- Open **Deploy** → choose a **Reserved VM** deployment (not Autoscale). A Reserved VM keeps the
  single world process always-on and keeps its disk, which is what a stateful MMO needs.
  (Autoscale spins instances down and would drop the live world; use it only for stateless apps.)
- The included `.replit` already sets `deploymentTarget = "vm"` and `run = ["npm","start"]`.

## 3. Player data: never lost, never corrupt

Two storage backends are supported and selected automatically:

### Option A — Hardened file store (default, zero setup)
Player data lives in `./data` on the Repl's persistent disk. Each player is a separate file
written **atomically** (temp file → fsync → atomic rename), so a crash mid-write cannot tear a
file. Every 5 minutes a full **rotating backup** is snapshotted into `data/backups/` (last 24
kept), and on startup any unreadable record is **auto-recovered from the newest good backup** (or
quarantined if unrecoverable) — one bad file can never lose the whole realm.

### Option B — Replit PostgreSQL (managed backups + point-in-time restore)
For the strongest guarantees, add a database:

1. In your Repl, open the **Database** tool (or **Tools → PostgreSQL**) and **create a PostgreSQL
   database**. Replit provisions it and injects a `DATABASE_URL` secret.
2. Restart the Repl. On boot you'll see `[store] using PostgreSQL (DATABASE_URL) with managed
   backups`. Each player is one row (JSONB) written in its own transaction, with an append-only
   `player_history` audit table. Replit's managed Postgres adds continuous backups / point-in-time
   restore on top.

No code change is needed to switch — just add (or remove) the database.

## 4. Environment variables (all optional)

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `8123` | Replit sets this automatically. |
| `HOST` | `0.0.0.0` | Bind address (must be `0.0.0.0` on Replit). |
| `DATABASE_URL` | — | If present, use PostgreSQL instead of the file store. |
| `DATA_DIR` | `./data` | Where the file store keeps players, ledger, and backups. |

## 5. Backups you can download

The `data/backups/` folder (file store) is a set of plain timestamped copies you can download from
the Replit file browser at any time. With PostgreSQL, use Replit's database backup/restore UI, or
`pg_dump "$DATABASE_URL"` from the Shell.
