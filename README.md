# TradeVault

A personal crypto trade tracking web application. Log, manage, and analyze your cryptocurrency trades with real-time P&L calculations.

## Project Structure

```
tradevault/
├── backend/          # Node.js + Express REST API (port 5000)
├── frontend/         # Next.js 14 App Router (port 3000)
├── README.md
└── SCALABILITY.md
```

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- npm or yarn

## Setup

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your values
npm install
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local with your values
npm install
npm run dev
```

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Example |
|---|---|---|
| `PORT` | API server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/tradevault` |
| `JWT_SECRET` | Secret for signing JWTs (min 32 chars) | `your_secret_here` |
| `NODE_ENV` | Environment | `development` |
| `CLIENT_URL` | Frontend origin for CORS | `http://localhost:3000` |

### Frontend (`frontend/.env.local`)

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL | `http://localhost:5000` |
| `NEXT_PUBLIC_APP_NAME` | Application display name | `TradeVault` |

## Available Scripts

### Backend

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm test` | Run Jest test suite |
| `npm run seed` | Seed database with sample data |

### Frontend

| Script | Description |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm test` | Run Jest test suite |

## API

The REST API is available at `http://localhost:5000/api/v1`.  
Interactive documentation (Swagger UI) is served at `http://localhost:5000/api/docs`.

## Seed Data

Run `npm run seed` from the `backend/` directory to populate the database with:

- **Admin**: `admin@tradevault.com` / `Admin@1234`
- **Trader**: `trader@tradevault.com` / `Trader@1234` (with 6 sample trades)
