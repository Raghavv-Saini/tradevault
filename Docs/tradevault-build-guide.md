# TradeVault — build guide

This guide walks you through building TradeVault from scratch, in the exact order you should do things. Follow each phase completely before moving to the next. Every phase ends with something that runs.

---

## Before you start — install these tools

Install everything below before writing a single line of Go.

```bash
# 1. Go 1.22+
# Download from https://go.dev/dl/ and follow installer

# 2. Docker Desktop
# Download from https://www.docker.com/products/docker-desktop

# 3. golang-migrate CLI
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# 4. sqlc
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest

# 5. abigen (for blockchain bindings — install later in Phase 5)
go install github.com/ethereum/go-ethereum/cmd/abigen@latest

# 6. solc (Solidity compiler — needed for Phase 5)
# Mac:   brew install solidity
# Linux: snap install solc --classic
# Or use Remix IDE in browser (no install needed)

# 7. Postman or Bruno (for testing API endpoints)
# https://www.postman.com/downloads/

# Verify installs
go version
docker --version
migrate --version
sqlc version
```

Also install these browser tools:
- **MetaMask** — browser extension from `metamask.io`. Set up a wallet and save your seed phrase somewhere safe.
- **Remix IDE** — no install, just open `remix.ethereum.org` when you reach Phase 5.

---

## External accounts to create (all free)

| Service | What it's for | Sign up at |
|---|---|---|
| Alchemy | Ethereum RPC node (free tier) | `alchemy.com` |
| Sepolia faucet | Free test ETH | `sepoliafaucet.com` |

For Alchemy: create an account → create a new app → select chain "Ethereum" → network "Sepolia" → copy the HTTPS URL. It looks like `https://eth-sepolia.g.alchemy.com/v2/your_key`.

For Sepolia: connect MetaMask to Sepolia testnet, copy your wallet address, paste it at `sepoliafaucet.com`, receive free test ETH.

---

## Phase 1 — foundation

**Goal:** a running Go server with user registration, login, and JWT auth working end-to-end.

### Step 1.1 — scaffold the project

```bash
mkdir tradevault && cd tradevault
go mod init github.com/yourname/tradevault

# Create folder structure
mkdir -p cmd/server
mkdir -p internal/api/middleware
mkdir -p internal/api/handlers
mkdir -p internal/db/migrations
mkdir -p internal/db/queries
mkdir -p internal/models
mkdir -p internal/services
mkdir -p internal/workers
mkdir -p internal/blockchain
mkdir -p internal/ws
mkdir -p config
mkdir -p contracts
mkdir -p contracts/build

# Create entry point
touch cmd/server/main.go
touch config/config.go
touch .env
touch .gitignore
```

Add to `.gitignore`:
```
.env
contracts/build/
tradevault
*.bin
*.abi
```

### Step 1.2 — install Go dependencies

```bash
go get github.com/gofiber/fiber/v2
go get github.com/golang-jwt/jwt/v5
go get golang.org/x/crypto/bcrypt
go get github.com/jackc/pgx/v5
go get github.com/jackc/pgx/v5/pgxpool
go get github.com/redis/go-redis/v9
go get github.com/joho/godotenv
```

### Step 1.3 — write `config/config.go`

Load all environment variables into a typed struct. Use `godotenv` to read `.env` in development. Every other package imports config — write this first.

```go
package config

import (
    "log"
    "os"
    "strconv"
    "github.com/joho/godotenv"
)

type Config struct {
    Port              string
    DBUrl             string
    RedisUrl          string
    JWTSecret         string
    JWTExpiryHours    int
    EthRPCUrl         string
    ContractAddress   string
    DeployerKey       string
    SMTPHost          string
    SMTPPort          int
    SMTPUser          string
    SMTPPass          string
    BinanceBaseUrl    string
    PricePollInterval int
}

func Load() *Config {
    _ = godotenv.Load()
    return &Config{
        Port:              getEnv("PORT", "8080"),
        DBUrl:             mustEnv("DB_URL"),
        RedisUrl:          getEnv("REDIS_URL", "redis://localhost:6379"),
        JWTSecret:         mustEnv("JWT_SECRET"),
        JWTExpiryHours:    getEnvInt("JWT_EXPIRY_HOURS", 24),
        EthRPCUrl:         getEnv("ETH_RPC_URL", ""),
        ContractAddress:   getEnv("CONTRACT_ADDRESS", ""),
        DeployerKey:       getEnv("DEPLOYER_PRIVATE_KEY", ""),
        SMTPHost:          getEnv("SMTP_HOST", ""),
        SMTPPort:          getEnvInt("SMTP_PORT", 587),
        SMTPUser:          getEnv("SMTP_USER", ""),
        SMTPPass:          getEnv("SMTP_PASS", ""),
        BinanceBaseUrl:    getEnv("BINANCE_BASE_URL", "https://api.binance.com"),
        PricePollInterval: getEnvInt("PRICE_POLL_INTERVAL_SECONDS", 10),
    }
}

func getEnv(key, fallback string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return fallback
}

func mustEnv(key string) string {
    v := os.Getenv(key)
    if v == "" {
        log.Fatalf("required env var %s is not set", key)
    }
    return v
}

func getEnvInt(key string, fallback int) int {
    if v := os.Getenv(key); v != "" {
        if i, err := strconv.Atoi(v); err == nil {
            return i
        }
    }
    return fallback
}
```

### Step 1.4 — start Docker services

```bash
# Create docker-compose.yml (see spec file for full content)
# Then start Postgres and Redis:
docker-compose up -d postgres redis

# Verify they're running
docker ps
```

### Step 1.5 — write and run migration 001

Create `internal/db/migrations/000001_users.up.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TYPE user_role AS ENUM ('trader', 'supervisor');
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          user_role NOT NULL DEFAULT 'trader',
    supervisor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Create `internal/db/migrations/000001_users.down.sql`:

```sql
DROP TABLE IF EXISTS users;
DROP TYPE IF EXISTS user_role;
```

Run it:
```bash
migrate -path internal/db/migrations -database "$DB_URL" up
```

### Step 1.6 — write the auth handler

Implement `internal/api/handlers/auth.go` with two functions:

`Register(c *fiber.Ctx)` — parse body, hash password with `bcrypt.GenerateFromPassword`, insert into users table, return 201.

`Login(c *fiber.Ctx)` — find user by email, compare password with `bcrypt.CompareHashAndPassword`, if valid sign a JWT with `golang-jwt`, return the token.

JWT claims to include: `user_id`, `role`, `exp`.

### Step 1.7 — write JWT middleware

`internal/api/middleware/auth.go` — reads the `Authorization: Bearer <token>` header, validates the JWT, extracts `user_id` and `role`, stores them in `c.Locals("userID")` and `c.Locals("role")`. Returns 401 if missing or invalid.

### Step 1.8 — wire up routes and `main.go`

```go
// cmd/server/main.go
func main() {
    cfg := config.Load()
    db  := connectPostgres(cfg.DBUrl)
    rdb := connectRedis(cfg.RedisUrl)

    app := fiber.New()
    api := app.Group("/api/v1")

    // public
    api.Post("/register", handlers.Register(db))
    api.Post("/login",    handlers.Login(db, cfg))

    // protected (all routes below require JWT)
    api.Use(middleware.Auth(cfg.JWTSecret))

    app.Listen(":" + cfg.Port)
}
```

### Phase 1 checkpoint

Test with Postman or curl:
```bash
# Register
curl -X POST http://localhost:8080/api/v1/register \
  -H "Content-Type: application/json" \
  -d '{"email":"trader@test.com","password":"password123","role":"trader"}'

# Login — copy the token from the response
curl -X POST http://localhost:8080/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"email":"trader@test.com","password":"password123"}'

# Hit a protected route (should 200 with valid token, 401 without)
curl http://localhost:8080/api/v1/trades \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Phase 1 is done when register and login work and the JWT middleware correctly allows/rejects requests.

---

## Phase 2 — risk engine and trade submission

**Goal:** traders can submit trades, risk limits are enforced, blocked trades are logged.

### Step 2.1 — write and run migrations 002–005

Create all four remaining migration files (see spec for SQL). Run them:

```bash
migrate -path internal/db/migrations -database "$DB_URL" up
```

### Step 2.2 — set up sqlc

Create `sqlc.yaml` (see spec). Then write SQL queries in `internal/db/queries/`:

- `trades.sql` — InsertTrade, GetTradeByID, GetTradesByTrader, GetPendingTrades, UpdateAnchorStatus
- `users.sql` — GetUserByEmail, GetUserByID, GetTradersBySupervisor
- `limits.sql` — GetLimitsByTrader, UpsertLimits
- `blocked.sql` — InsertBlockedTrade, GetBlockedTrades, ApproveBlockedTrade
- `audit.sql` — InsertAuditLog, GetAuditLog

Generate Go code:
```bash
sqlc generate
```

This creates typed Go functions in `internal/models/`. You call these instead of writing raw DB queries.

### Step 2.3 — write the risk service

`internal/services/risk.go` — implement `CheckLimits()`. It should:
1. Try to get limits from Redis (`limits:{traderID}`) — if miss, fetch from DB and cache with 5-minute TTL.
2. Get today's loss from Redis (`loss:{traderID}:{date}`).
3. Get today's volume from Redis (`vol:{traderID}:{date}`).
4. Run the three checks (position size, daily loss, daily volume).
5. Return `LimitCheckResult{Allowed, Reason}`.

### Step 2.4 — write risk middleware

`internal/api/middleware/risk.go` — calls `CheckLimits()` with the incoming trade body. If not allowed, inserts a row into `blocked_trades`, writes to `audit_log`, returns HTTP 403 with the reason. If allowed, calls `c.Next()`.

### Step 2.5 — write the trades handler

`internal/api/handlers/trades.go`:

`POST /api/v1/trades` — parse body, run through risk middleware (wired in routes), save trade with `anchor_status = 'pending'`, increment Redis counters with `INCRBYFLOAT`, write audit log entry, return 201 with trade ID.

`GET /api/v1/trades` — query `GetTradesByTrader` with pagination, return JSON array.

### Phase 2 checkpoint

```bash
# Submit a trade (should 201)
curl -X POST http://localhost:8080/api/v1/trades \
  -H "Authorization: Bearer TRADER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"asset":"BTC","size":1000,"price":62000,"direction":"buy"}'

# Submit a trade that breaches size limit (should 403)
curl -X POST http://localhost:8080/api/v1/trades \
  -H "Authorization: Bearer TRADER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"asset":"BTC","size":999999,"price":62000,"direction":"buy"}'
```

Phase 2 is done when allowed trades save to DB and oversized trades return 403 and appear in `blocked_trades`.

---

## Phase 3 — supervisor features

**Goal:** supervisors can see their team, manage limits, and review blocked trades.

### Step 3.1 — supervisor routes

Add these routes in `routes.go` under a supervisor-only middleware group that checks `c.Locals("role") == "supervisor"`:

- `GET /api/v1/supervisor/team` — query all traders where `supervisor_id = currentUserID`, for each trader compute today's P&L from the `trades` table.
- `PUT /api/v1/supervisor/traders/:id/limits` — upsert into `risk_limits`, delete the Redis cache key `limits:{traderID}` so it's re-fetched on next trade.
- `GET /api/v1/supervisor/blocked` — query `blocked_trades` for all traders on the team.
- `POST /api/v1/supervisor/blocked/:id/approve` — set `approved_by` and `approved_at` on the blocked trade, then re-submit the original trade payload bypassing the risk check, write audit log.
- `GET /api/v1/audit` — paginated query on `audit_log` with optional filters.

### Step 3.2 — CSV report endpoint

`GET /api/v1/supervisor/reports?period=monthly` — query trades for all team traders in the period, compute per-trader totals (trade count, total volume, realized P&L, win rate), encode as CSV using Go's standard `encoding/csv` package, set `Content-Type: text/csv` and `Content-Disposition: attachment; filename="report.csv"` headers.

### Phase 3 checkpoint

Register two users — one supervisor and one trader with `supervisor_id` set to the supervisor's ID. Submit several trades as the trader, including one that gets blocked. Then as the supervisor:

```bash
# See team
curl http://localhost:8080/api/v1/supervisor/team \
  -H "Authorization: Bearer SUPERVISOR_TOKEN"

# Update trader limits
curl -X PUT http://localhost:8080/api/v1/supervisor/traders/TRADER_ID/limits \
  -H "Authorization: Bearer SUPERVISOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"daily_loss_limit":10000,"max_position_size":50000,"max_daily_volume":100000}'

# Approve a blocked trade
curl -X POST http://localhost:8080/api/v1/supervisor/blocked/BLOCKED_ID/approve \
  -H "Authorization: Bearer SUPERVISOR_TOKEN"
```

Phase 3 is done when all supervisor routes respond correctly and limit changes take immediate effect on the next trade.

---

## Phase 4 — real-time prices and WebSocket P&L

**Goal:** live prices from Binance, P&L streamed over WebSocket to traders and supervisors.

### Step 4.1 — Binance price poller

`internal/workers/price_poller.go` — implement `RunPricePoller(ctx, redisClient)`. It runs as a goroutine, hits `https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT"]` every 10 seconds, parses the JSON array, strips the `USDT` suffix, and writes each price to Redis as `price:BTC`, `price:ETH` etc. with a 30-second TTL.

Start it from `main.go`:
```go
go workers.RunPricePoller(ctx, rdb)
```

Test the poller is working:
```bash
docker exec -it tradevault-redis-1 redis-cli GET price:BTC
# Should return something like "62400.53000000"
```

### Step 4.2 — WebSocket hub

`internal/ws/hub.go` — the hub holds a `map[string]*Client` protected by a `sync.RWMutex`. Implement:
- `NewHub() *Hub`
- `Register(userID string, client *Client)`
- `Unregister(userID string)`
- `Send(userID string, msg []byte)`
- `Broadcast(msg []byte)` — used for supervisor team feed

`internal/ws/client.go` — each client has a `send chan []byte`. A goroutine reads from the channel and writes to the WebSocket connection. On disconnect, calls `hub.Unregister`.

### Step 4.3 — WebSocket endpoints

`internal/api/handlers/ws.go`:

`GET /ws/pnl?token=JWT` — upgrade to WebSocket, validate the JWT from query param (WebSocket handshake can't send headers easily), register the client in the hub, compute and send an initial P&L snapshot.

`GET /ws/team?token=JWT` — same but for supervisors, registered under a different hub or channel.

### Step 4.4 — P&L push after trade save

In the trade handler, after saving a trade to DB, compute the trader's current P&L (fetch open positions from DB, look up current prices from Redis) and call `hub.Send(traderID, pnlPayload)`. Also call `supervisorHub.Broadcast(teamUpdatePayload)` so the supervisor's dashboard updates.

### Phase 4 checkpoint

Open two browser tabs with a WebSocket client (e.g. the Postman WebSocket feature, or a simple HTML page with `new WebSocket(...)`). Connect as a trader on `/ws/pnl`. Submit a trade via the REST API. Verify the WebSocket receives a P&L update within a second.

---

## Phase 5 — blockchain audit trail

**Goal:** every trade gets its hash anchored on Ethereum Sepolia. Any trade can be verified as untampered.

### Step 5.1 — deploy the smart contract

1. Go to `remix.ethereum.org`.
2. Create `TradeLog.sol` and paste the contract from the spec.
3. Compile with Solidity 0.8.20.
4. In the Deploy tab, select `Injected Provider - MetaMask`.
5. Switch MetaMask to Sepolia network.
6. Click Deploy → confirm in MetaMask.
7. Copy the contract address from the Remix "Deployed Contracts" panel.
8. Paste it into your `.env` as `CONTRACT_ADDRESS`.

### Step 5.2 — generate Go bindings

```bash
# In your project root
make abigen
```

This reads the ABI and bytecode from `contracts/build/` and generates `internal/blockchain/tradelog.go`. Check that the file was created and contains `NewTradeLog`, `Anchor`, and `Verify` functions.

### Step 5.3 — write the blockchain client

`internal/blockchain/client.go`:

```go
func NewClient(rpcURL, privateKey string) (*ethclient.Client, *bind.TransactOpts, error) {
    client, err := ethclient.Dial(rpcURL)
    if err != nil {
        return nil, nil, err
    }
    key, err := crypto.HexToECDSA(privateKey)
    if err != nil {
        return nil, nil, err
    }
    chainID, err := client.NetworkID(context.Background())
    if err != nil {
        return nil, nil, err
    }
    auth, err := bind.NewKeyedTransactorWithChainID(key, chainID)
    if err != nil {
        return nil, nil, err
    }
    return client, auth, nil
}
```

### Step 5.4 — write anchor and verify functions

`internal/blockchain/anchor.go` — implement `ComputeTradeHash`, `AnchorTrade`, and `VerifyTrade` exactly as shown in the spec. The canonical string format must never change after deployment — if you change it, all past verifications break.

### Step 5.5 — start the anchor worker

`internal/workers/anchor_worker.go` — implement `RunAnchorWorker` as shown in the spec. Start it from `main.go`:

```go
go workers.RunAnchorWorker(ctx, db, contract, auth)
```

### Step 5.6 — add the verify endpoint

`GET /api/v1/trades/:id/verify` — fetch the trade from DB, call `blockchain.VerifyTrade`, return `{ "verified": true/false, "trade_id": "...", "chain_tx_hash": "..." }`.

### Phase 5 checkpoint

Submit a trade. Wait about 20–30 seconds. Check the trade's anchor status:

```bash
curl http://localhost:8080/api/v1/trades/TRADE_ID \
  -H "Authorization: Bearer TOKEN"
# anchor_status should be "anchored"

curl http://localhost:8080/api/v1/trades/TRADE_ID/verify \
  -H "Authorization: Bearer TOKEN"
# Should return { "verified": true }
```

Also check on-chain: go to `sepolia.etherscan.io`, paste the `chain_tx_hash`, and you should see the transaction to your contract address.

---

## Phase 6 — polish and containerisation

**Goal:** alerts working, everything runs in Docker, project is portfolio-ready.

### Step 6.1 — alert dispatcher

`internal/workers/alert_dispatcher.go` — this worker listens on a Go channel (not a ticker). When the risk middleware blocks a trade, it sends a `BlockedTradeAlert` struct to the channel. The dispatcher goroutine reads from it and sends an email via SMTP using Go's standard `net/smtp` package.

```go
type AlertChannel chan BlockedTradeAlert

// In main.go
alertCh := make(workers.AlertChannel, 100)
go workers.RunAlertDispatcher(ctx, cfg, alertCh)

// Pass alertCh to the risk middleware
// middleware calls alertCh <- alert when a trade is blocked
```

### Step 6.2 — full Docker build

Make sure `docker-compose up --build` starts everything and the API is reachable:

```bash
docker-compose down -v   # clean slate
docker-compose up --build
curl http://localhost:8080/api/v1/login  # should respond (even with 400 — just needs to be reachable)
```

If migrations don't run automatically on start, add a startup script to the Dockerfile that runs `migrate up` before starting the binary, or add an `initdb` service to docker-compose.

### Step 6.3 — write the README

The README is what people read when they look at your GitHub repo. Include:
- What TradeVault is (2–3 sentences)
- Architecture overview (just bullet points)
- Prerequisites (Go, Docker, MetaMask)
- Setup steps (clone → .env → docker-compose up → migrate → run)
- API endpoint table
- How the on-chain audit trail works (1 paragraph)
- Screenshot or curl examples

### Final checklist before calling it done

- [ ] Register + login returns JWT
- [ ] Trades are saved and appear in GET /trades
- [ ] Oversized/over-limit trades return 403 and appear in blocked_trades
- [ ] Supervisor can update limits and they take effect immediately
- [ ] Supervisor can approve blocked trades
- [ ] CSV report downloads correctly
- [ ] Binance prices appear in Redis within 10 seconds of server start
- [ ] WebSocket connection receives P&L update after trade submission
- [ ] Trades move from `pending` to `anchored` within ~30 seconds
- [ ] Verify endpoint returns `{ "verified": true }` for anchored trades
- [ ] `docker-compose up --build` starts everything cleanly
- [ ] `.env` is in `.gitignore` and not committed

---

## Common mistakes to avoid

**Changing the hash format after going live.** The `ComputeTradeHash` function must produce identical output every time. If you change the field order, separator, or format strings after trades are anchored, `VerifyTrade` will always return false for old trades. Freeze the format before Phase 5.

**Doing blockchain writes synchronously.** Never call `AnchorTrade` inside the HTTP request handler. It takes 15–30 seconds. Always do it in the background worker and return the response to the trader immediately.

**Not invalidating the Redis limit cache.** When a supervisor updates a trader's limits, you must delete the `limits:{traderID}` key from Redis. If you forget, the trader's next trades will still use the old cached limits for up to 5 minutes.

**WebSocket concurrent writes.** Never write to a WebSocket connection from multiple goroutines simultaneously — it will panic. All writes must go through the `send` channel on the client, which is consumed by a single goroutine.

**Hardcoding the private key.** Your `DEPLOYER_PRIVATE_KEY` is what signs Ethereum transactions. If it's committed to Git, anyone can drain the wallet. Keep it only in `.env`.

**Forgetting the append-only constraint.** Never run UPDATE or DELETE on `audit_log`. If you use an ORM or sqlc, make sure no generated method touches this table with mutations. Consider creating a separate Postgres role with INSERT + SELECT only and using that role's connection string for audit log operations.
