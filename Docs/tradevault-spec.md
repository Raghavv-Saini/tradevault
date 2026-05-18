# TradeVault — Kiro spec

## Project overview

TradeVault is a backend system built in Go for crypto trading firms. It tracks every trade a trader makes, enforces per-trader risk limits in real time, streams live P&L over WebSockets, and anchors an immutable hash of every trade on the Ethereum Sepolia testnet for tamper-proof audit compliance.

Two roles exist in the system: **Trader** and **Supervisor**. A supervisor has a team of traders under them and can set limits, review blocked trades, and export reports. A trader can submit trades and view their own portfolio and P&L.

Postgres and Redis run natively on the developer's machine — no Docker or containers of any kind.

---

## Tech stack

| Layer | Technology |
|---|---|
| Language | Go 1.22+ |
| HTTP framework | Fiber v2 |
| Auth | JWT (golang-jwt/jwt v5) |
| Database | PostgreSQL 15 (native install) |
| Query layer | sqlc (type-safe generated queries) |
| Migrations | golang-migrate |
| Cache | Redis 7 (native install) |
| Redis client | go-redis v9 |
| WebSockets | gorilla/websocket |
| Blockchain | go-ethereum (geth) |
| Testnet | Ethereum Sepolia |
| RPC provider | Alchemy (free tier) |
| Password hashing | golang.org/x/crypto/bcrypt |
| Price data | Binance public REST API |

---

## What Redis is used for and why

Redis is an in-memory key-value store. It is much faster than Postgres for data that is read on every single request. TradeVault uses Redis for four specific jobs:

### 1. Daily risk counters (most critical use)

Every time a trader submits a trade, the system must know two things before allowing it: how much has this trader lost today, and how much volume have they traded today. These numbers are checked on every single trade submission.

If these were stored only in Postgres, every trade submission would need to run an aggregate query like `SUM(loss) WHERE trader_id = X AND created_at > today`. Under load this gets slow. Instead, Redis keeps two running totals per trader per day:

```
loss:{traderID}:{date}   → float   (incremented atomically on every trade)
vol:{traderID}:{date}    → float   (incremented atomically on every trade)
```

These are updated with Redis's `INCRBYFLOAT` command which is atomic — no race condition possible even with concurrent trade submissions from the same trader. They expire at midnight automatically via TTL.

### 2. Risk limit cache

Each trader has a row in the `risk_limits` table in Postgres. The risk check middleware reads these limits on every single trade submission. Reading from Postgres on every request is wasteful since limits almost never change.

Redis caches the limits as a JSON blob:
```
limits:{traderID}  → JSON string   (5 minute TTL)
```

When a supervisor updates a trader's limits, the cache key is deleted immediately so the new limits take effect on the very next trade — no waiting for TTL.

### 3. Live price cache

The Binance price poller runs every 10 seconds and writes the latest prices to Redis:
```
price:BTC  → "62400.53"   (30 second TTL)
price:ETH  → "3100.20"    (30 second TTL)
```

The P&L calculation reads prices from Redis, not by making a live HTTP call to Binance on every request. This means P&L is always fast to compute and the system keeps working even if Binance has a brief outage (the last cached price is used until TTL expires).

### 4. JWT session store

When a user logs in, a session key is written to Redis:
```
session:{userID}  → "valid"   (TTL = JWT expiry duration, 24h)
```

When a user logs out, this key is deleted. The auth middleware checks this key exists — if it doesn't, the request is rejected even if the JWT signature is technically valid. This is how logout actually works with JWTs, which are otherwise stateless and can't be "cancelled" without a server-side store.

### Summary table

| Redis key | Written by | Read by | Why not Postgres |
|---|---|---|---|
| `loss:{id}:{date}` | Trade handler | Risk middleware | Incremented on every trade — needs atomic counter |
| `vol:{id}:{date}` | Trade handler | Risk middleware | Same as above |
| `limits:{id}` | Limit update handler (on miss: DB) | Risk middleware | Read on every trade — Postgres query is wasteful |
| `price:{ASSET}` | Price poller goroutine | P&L service | Updated every 10s — no point hitting Binance per request |
| `session:{id}` | Login handler | Auth middleware | Allows real logout for stateless JWTs |

---

## Folder structure

```
tradevault/
├── cmd/
│   └── server/
│       └── main.go              # entry point — wires everything together
├── internal/
│   ├── api/
│   │   ├── routes.go            # registers all routes
│   │   ├── middleware/
│   │   │   ├── auth.go          # JWT validation + session check
│   │   │   └── risk.go          # risk limit check before every trade
│   │   └── handlers/
│   │       ├── auth.go          # POST /register, POST /login, POST /logout
│   │       ├── trades.go        # POST /trades, GET /trades
│   │       ├── supervisor.go    # limits, blocked trades, reports
│   │       └── ws.go            # WebSocket upgrade
│   ├── db/
│   │   ├── migrations/          # numbered .sql up/down files
│   │   └── queries/             # .sql files consumed by sqlc
│   ├── models/                  # auto-generated by sqlc — do not edit manually
│   ├── services/
│   │   ├── risk.go              # CheckLimits() — reads Redis, enforces limits
│   │   ├── pnl.go               # P&L calculation using Redis price cache
│   │   ├── audit.go             # WriteAuditLog() — append-only
│   │   └── report.go            # CSV report generation
│   ├── workers/
│   │   ├── price_poller.go      # goroutine: Binance → Redis every 10s
│   │   ├── anchor_worker.go     # goroutine: anchors pending trades on-chain
│   │   └── alert_dispatcher.go  # goroutine: sends SMTP email on limit breach
│   ├── blockchain/
│   │   ├── client.go            # go-ethereum setup
│   │   ├── tradelog.go          # abigen-generated bindings (do not edit)
│   │   └── anchor.go            # ComputeTradeHash, AnchorTrade, VerifyTrade
│   └── ws/
│       ├── hub.go               # connection registry: userID → WebSocket
│       └── client.go            # per-connection read/write goroutines
├── contracts/
│   ├── TradeLog.sol             # Solidity source
│   └── build/                   # compiled ABI + bytecode (git-ignored)
├── config/
│   └── config.go                # typed config loaded from .env
├── Makefile
└── sqlc.yaml
```

---

## Database schema

### Migration 001 — users

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM ('trader', 'supervisor');

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'trader',
    supervisor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Migration 002 — risk_limits

```sql
CREATE TABLE risk_limits (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trader_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    daily_loss_limit    NUMERIC(18,8) NOT NULL DEFAULT 5000,
    max_position_size   NUMERIC(18,8) NOT NULL DEFAULT 20000,
    max_daily_volume    NUMERIC(18,8) NOT NULL DEFAULT 50000,
    updated_by          UUID REFERENCES users(id),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (trader_id)
);
```

### Migration 003 — trades

```sql
CREATE TYPE trade_direction AS ENUM ('buy', 'sell');
CREATE TYPE anchor_status   AS ENUM ('pending', 'anchored', 'failed');

CREATE TABLE trades (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trader_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset           TEXT NOT NULL,
    size            NUMERIC(18,8) NOT NULL,
    price           NUMERIC(18,8) NOT NULL,
    direction       trade_direction NOT NULL,
    realized_pnl    NUMERIC(18,8) NOT NULL DEFAULT 0,
    chain_tx_hash   TEXT,
    anchor_status   anchor_status NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trades_trader_id  ON trades(trader_id);
CREATE INDEX idx_trades_created_at ON trades(created_at);
```

### Migration 004 — blocked_trades

```sql
CREATE TABLE blocked_trades (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trader_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trade_payload   JSONB NOT NULL,
    block_reason    TEXT NOT NULL,
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Migration 005 — audit_log

```sql
CREATE TYPE audit_action AS ENUM (
    'trade_submitted',
    'trade_blocked',
    'trade_approved',
    'trade_anchored',
    'limit_updated',
    'login',
    'register'
);

CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    action          audit_action NOT NULL,
    entity_type     TEXT,
    entity_id       UUID,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id    ON audit_log(user_id);
CREATE INDEX idx_audit_created_at ON audit_log(created_at);
```

> The audit_log table is append-only. After running this migration, revoke UPDATE and DELETE from the app user: `REVOKE UPDATE, DELETE ON audit_log FROM tradevault_user;`

---

## Binance price integration

No API key required. The ticker endpoint is public and unauthenticated.

### Endpoint

```
GET https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT","SOLUSDT"]
```

Returns:
```json
[
  { "symbol": "BTCUSDT", "price": "62400.53000000" },
  { "symbol": "ETHUSDT", "price": "3100.20000000" }
]
```

### Asset naming convention

Store assets in the trades table as the base symbol only: `BTC`, `ETH`, `SOL`. Append `USDT` when building the Binance query string.

### Price poller (`internal/workers/price_poller.go`)

```go
const BinanceTickerURL = "https://api.binance.com/api/v3/ticker/price"

var TrackedAssets = []string{"BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"}

func RunPricePoller(ctx context.Context, cache *redis.Client) {
    ticker := time.NewTicker(10 * time.Second)
    defer ticker.Stop()
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            prices, err := fetchBinancePrices(TrackedAssets)
            if err != nil {
                log.Printf("price poller error: %v", err)
                continue
            }
            for symbol, price := range prices {
                base := strings.TrimSuffix(symbol, "USDT")
                cache.Set(ctx, "price:"+base, price, 30*time.Second)
            }
        }
    }
}

func fetchBinancePrices(symbols []string) (map[string]string, error) {
    symbolsJSON, _ := json.Marshal(symbols)
    url := fmt.Sprintf("%s?symbols=%s", BinanceTickerURL, symbolsJSON)
    resp, err := http.Get(url)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    var result []struct {
        Symbol string `json:"symbol"`
        Price  string `json:"price"`
    }
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return nil, err
    }
    prices := make(map[string]string, len(result))
    for _, r := range result {
        prices[r.Symbol] = r.Price
    }
    return prices, nil
}
```

---

## Solidity contract

File: `contracts/TradeLog.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TradeLog {
    mapping(string => bytes32) public tradeHashes;

    event TradeAnchored(string indexed tradeId, bytes32 hash, uint256 timestamp);

    function anchor(string calldata tradeId, bytes32 hash) external {
        require(tradeHashes[tradeId] == bytes32(0), "Trade already anchored");
        tradeHashes[tradeId] = hash;
        emit TradeAnchored(tradeId, hash, block.timestamp);
    }

    function verify(string calldata tradeId, bytes32 hash) external view returns (bool) {
        return tradeHashes[tradeId] == hash;
    }
}
```

### Deploy steps

1. Open `remix.ethereum.org`.
2. Create `TradeLog.sol`, paste contract above.
3. Compiler tab → select `0.8.20` → Compile.
4. Deploy tab → environment: `Injected Provider - MetaMask`.
5. MetaMask must be on Sepolia testnet with test ETH.
6. Click Deploy → confirm in MetaMask.
7. Copy deployed contract address → paste into `.env` as `CONTRACT_ADDRESS`.

### Generate Go bindings

```bash
go install github.com/ethereum/go-ethereum/cmd/abigen@latest

solc --abi --bin contracts/TradeLog.sol -o contracts/build/

abigen \
  --abi contracts/build/TradeLog.abi \
  --bin contracts/build/TradeLog.bin \
  --pkg blockchain \
  --type TradeLog \
  --out internal/blockchain/tradelog.go
```

---

## Environment variables (`.env`)

```env
PORT=8080
ENV=development

# Postgres — native local instance
DB_URL=postgresql://tradevault_user:yourpassword@localhost:5432/tradevault?sslmode=disable

# Redis — native local instance
REDIS_URL=redis://localhost:6379

JWT_SECRET=replace_with_a_long_random_secret_min_32_chars
JWT_EXPIRY_HOURS=24

ETH_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
CONTRACT_ADDRESS=0xYOUR_DEPLOYED_CONTRACT_ADDRESS
DEPLOYER_PRIVATE_KEY=YOUR_WALLET_PRIVATE_KEY_WITHOUT_0x_PREFIX

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_app_password

BINANCE_BASE_URL=https://api.binance.com
PRICE_POLL_INTERVAL_SECONDS=10
```

---

## API routes

### Auth

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/api/v1/register` | public | Body: `{ email, password, role, supervisor_id? }` |
| POST | `/api/v1/login` | public | Returns signed JWT. Body: `{ email, password }` |
| POST | `/api/v1/logout` | any | Deletes Redis session key. Requires valid JWT. |

### Trades

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/api/v1/trades` | trader | Submit trade. Risk check runs first. Body: `{ asset, size, price, direction }` |
| GET | `/api/v1/trades` | trader | Paginated history. Params: `from`, `to`, `asset`, `page`, `limit` |
| GET | `/api/v1/trades/:id` | trader | Single trade with anchor status |
| GET | `/api/v1/trades/:id/verify` | trader, supervisor | Returns `{ verified: bool }` |

### Supervisor

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/v1/supervisor/team` | supervisor | All traders with live P&L summary |
| GET | `/api/v1/supervisor/traders/:id/trades` | supervisor | Trade history for one trader |
| PUT | `/api/v1/supervisor/traders/:id/limits` | supervisor | Update risk limits. Invalidates Redis cache. |
| GET | `/api/v1/supervisor/blocked` | supervisor | All blocked trades across team |
| POST | `/api/v1/supervisor/blocked/:id/approve` | supervisor | Re-submits blocked trade, logs approver |
| GET | `/api/v1/supervisor/reports` | supervisor | CSV download. Params: `period` (monthly/weekly) |

### Audit

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/v1/audit` | supervisor | Paginated audit log. Params: `trader_id`, `action`, `from`, `to` |

### WebSocket

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/ws/pnl` | trader | Live P&L stream. Auth via `?token=JWT` |
| GET | `/ws/team` | supervisor | Live team P&L stream. Auth via `?token=JWT` |

---

## Core logic

### Risk middleware (`internal/api/middleware/risk.go`)

Runs before the trade handler on every `POST /api/v1/trades`.

```go
type LimitCheckResult struct {
    Allowed bool
    Reason  string
}

func CheckLimits(db *DB, cache *redis.Client, traderID string, trade TradeInput) LimitCheckResult {
    // 1. Try Redis first (fast path)
    limits := getLimitsFromCache(cache, traderID)
    if limits == nil {
        // 2. Cache miss — fetch from Postgres and cache for 5 minutes
        limits = getLimitsFromDB(db, traderID)
        cacheLimits(cache, traderID, limits) // SET limits:{id} JSON EX 300
    }

    // 3. Read today's running totals from Redis (atomic counters)
    todayLoss   := getDailyLoss(cache, traderID)   // GET loss:{id}:{date}
    todayVolume := getDailyVolume(cache, traderID)  // GET vol:{id}:{date}

    if trade.Size > limits.MaxPositionSize {
        return LimitCheckResult{false, "position size exceeds limit"}
    }
    if todayLoss+trade.ExpectedLoss > limits.DailyLossLimit {
        return LimitCheckResult{false, "daily loss limit would be breached"}
    }
    if todayVolume+trade.Size > limits.MaxDailyVolume {
        return LimitCheckResult{false, "daily volume limit would be breached"}
    }
    return LimitCheckResult{Allowed: true}
}
```

After a trade passes: increment Redis counters atomically.

```go
today := time.Now().Format("2006-01-02")
cache.IncrByFloat(ctx, "loss:"+traderID+":"+today, trade.ExpectedLoss)
cache.IncrByFloat(ctx, "vol:"+traderID+":"+today, trade.Size)
// Set expiry to end of day if key is new
cache.ExpireAt(ctx, "loss:"+traderID+":"+today, midnight())
cache.ExpireAt(ctx, "vol:"+traderID+":"+today, midnight())
```

### Trade hash (`internal/blockchain/anchor.go`)

```go
// This exact format must NEVER change after deployment.
// Any change breaks verification of all previously anchored trades.
func ComputeTradeHash(t db.Trade) [32]byte {
    raw := fmt.Sprintf("%s|%s|%s|%.8f|%.8f|%s|%d",
        t.ID.String(),
        t.TraderID.String(),
        t.Asset,
        t.Size,
        t.Price,
        t.Direction,
        t.CreatedAt.Unix(),
    )
    return sha256.Sum256([]byte(raw))
}

func AnchorTrade(contract *TradeLog, auth *bind.TransactOpts, t db.Trade) (string, error) {
    hash := ComputeTradeHash(t)
    tx, err := contract.Anchor(auth, t.ID.String(), hash)
    if err != nil {
        return "", err
    }
    return tx.Hash().Hex(), nil
}

func VerifyTrade(contract *TradeLog, t db.Trade) (bool, error) {
    hash := ComputeTradeHash(t)
    return contract.Verify(nil, t.ID.String(), hash)
}
```

### Anchor worker (`internal/workers/anchor_worker.go`)

Runs as a background goroutine. Picks up trades with `anchor_status = 'pending'` every 10 seconds.

```go
func RunAnchorWorker(ctx context.Context, db *DB, contract *blockchain.TradeLog, auth *bind.TransactOpts) {
    ticker := time.NewTicker(10 * time.Second)
    defer ticker.Stop()
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            trades := db.GetPendingTrades(ctx)
            for _, t := range trades {
                txHash, err := blockchain.AnchorTrade(contract, auth, t)
                if err != nil {
                    db.UpdateAnchorStatus(ctx, t.ID, "failed")
                    continue
                }
                db.UpdateAnchorStatus(ctx, t.ID, "anchored")
                db.SaveTxHash(ctx, t.ID, txHash)
            }
        }
    }
}
```

### WebSocket hub (`internal/ws/hub.go`)

```go
type Hub struct {
    mu      sync.RWMutex
    clients map[string]*Client // userID → connection
}

func (h *Hub) Register(userID string, c *Client) {
    h.mu.Lock(); defer h.mu.Unlock()
    h.clients[userID] = c
}

func (h *Hub) Unregister(userID string) {
    h.mu.Lock(); defer h.mu.Unlock()
    delete(h.clients, userID)
}

func (h *Hub) Send(userID string, msg []byte) {
    h.mu.RLock(); defer h.mu.RUnlock()
    if c, ok := h.clients[userID]; ok {
        c.send <- msg
    }
}

func (h *Hub) Broadcast(msg []byte) {
    h.mu.RLock(); defer h.mu.RUnlock()
    for _, c := range h.clients {
        c.send <- msg
    }
}
```

---

## P&L calculation

```
unrealizedPnL = positionSize × (currentPrice − entryPrice)
```

`currentPrice` comes from Redis `price:{ASSET}` (written by price poller).
`entryPrice` is the `price` column on the trade row.

WebSocket payload pushed after every trade:

```json
{
  "trader_id": "uuid",
  "realized_pnl": 1240.50,
  "unrealized_pnl": 320.75,
  "total_pnl": 1561.25,
  "daily_loss": 430.00,
  "daily_volume": 18500.00,
  "timestamp": 1716000000
}
```

---

## Redis key reference

| Key pattern | Set by | Read by | TTL |
|---|---|---|---|
| `price:{ASSET}` | Price poller | P&L service | 30s |
| `limits:{traderID}` | Auth handler / risk service (on DB miss) | Risk middleware | 5 min |
| `loss:{traderID}:{YYYY-MM-DD}` | Trade handler | Risk middleware | Expires at midnight |
| `vol:{traderID}:{YYYY-MM-DD}` | Trade handler | Risk middleware | Expires at midnight |
| `session:{userID}` | Login handler | Auth middleware | 24h (JWT expiry) |

---

## Makefile

```makefile
.PHONY: dev migrate-up migrate-down generate abigen build test

dev:
	go run ./cmd/server

migrate-up:
	migrate -path internal/db/migrations -database "${DB_URL}" up

migrate-down:
	migrate -path internal/db/migrations -database "${DB_URL}" down

generate:
	sqlc generate

abigen:
	solc --abi --bin contracts/TradeLog.sol -o contracts/build/
	abigen --abi contracts/build/TradeLog.abi --bin contracts/build/TradeLog.bin \
		--pkg blockchain --type TradeLog --out internal/blockchain/tradelog.go

build:
	go build -o tradevault ./cmd/server

test:
	go test ./...
```

---

## `sqlc.yaml`

```yaml
version: "2"
sql:
  - engine: "postgresql"
    queries: "internal/db/queries/"
    schema: "internal/db/migrations/"
    gen:
      go:
        package: "db"
        out: "internal/models"
        emit_json_tags: true
        emit_prepared_queries: false
        emit_interface: true
```

---

## Build order for Kiro

Implement in this exact order. Each phase must be fully working before the next begins.

### Phase 1 — foundation
- Project scaffold with folder structure above
- `config.go` loading all env vars from `.env`
- Postgres connection via pgxpool (native local instance)
- Redis connection via go-redis (native local instance)
- Migration 001 (users table)
- `POST /api/v1/register` — bcrypt hash password, insert user, write audit log
- `POST /api/v1/login` — verify password, sign JWT, write `session:{userID}` to Redis
- `POST /api/v1/logout` — delete `session:{userID}` from Redis
- JWT auth middleware — validate token, check `session:{userID}` exists in Redis, inject `userID` + `role` into Fiber `Locals`

### Phase 2 — risk engine and trades
- Migrations 002, 003, 004, 005
- Revoke UPDATE/DELETE on `audit_log` from app DB user
- sqlc queries for all five tables
- `POST /api/v1/trades` with risk check middleware
- Risk service: reads limits from Redis (fallback to Postgres), reads daily counters from Redis
- On allowed trade: save to Postgres, increment Redis counters with `INCRBYFLOAT`, write audit log
- On blocked trade: save to `blocked_trades`, write audit log, return 403
- `GET /api/v1/trades` with pagination

### Phase 3 — supervisor features
- `GET /api/v1/supervisor/team`
- `PUT /api/v1/supervisor/traders/:id/limits` — update Postgres, delete `limits:{traderID}` from Redis
- `GET /api/v1/supervisor/blocked` + `POST /api/v1/supervisor/blocked/:id/approve`
- `GET /api/v1/audit`
- `GET /api/v1/supervisor/reports` — CSV export via `encoding/csv`

### Phase 4 — real-time
- Binance price poller goroutine writing to Redis every 10s
- WebSocket hub (hub.go + client.go)
- `/ws/pnl` for traders, `/ws/team` for supervisors
- P&L push after every trade save

### Phase 5 — blockchain
- Deploy `TradeLog.sol` to Sepolia via Remix IDE
- Run `make abigen` to generate Go bindings
- Blockchain client (`client.go`) using go-ethereum + Alchemy RPC
- Anchor worker goroutine
- `GET /api/v1/trades/:id/verify`

### Phase 6 — polish
- Alert dispatcher goroutine (SMTP email on limit breach)
- README with setup instructions
- Final checklist verification

---

## Security rules

- Never log private keys, JWT secrets, or raw passwords anywhere.
- All routes except `/register` and `/login` require a valid JWT **and** a live Redis session key.
- Supervisor routes must check `role == supervisor` in middleware — never trust the frontend.
- `audit_log` is append-only — revoke UPDATE and DELETE at the DB level in Phase 2.
- Store `DEPLOYER_PRIVATE_KEY` only in `.env`, never hardcode it or commit it.
- Use `bcrypt.DefaultCost` (10) minimum for password hashing.
- JWT tokens expire in 24 hours; real logout works by deleting the Redis session key.
- Never call `AnchorTrade` synchronously inside an HTTP handler — always use the background worker.