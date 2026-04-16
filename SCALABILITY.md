# Scalability Considerations

This document outlines the architectural decisions made in TradeVault and how the system can be scaled as usage grows.

## Monorepo Independence

The `backend/` and `frontend/` packages are fully independent — each has its own `package.json`, `tsconfig.json`, and can be deployed separately. This means:

- **Backend** can be containerized and deployed to any Node.js-compatible host (Railway, Render, EC2, etc.)
- **Frontend** can be deployed to Vercel, Netlify, or any static/SSR host independently
- Each package can be scaled horizontally without affecting the other

## Backend Scalability

### Stateless Authentication

JWTs stored in httpOnly cookies make the API stateless — any backend instance can verify a token without shared session storage. This enables horizontal scaling behind a load balancer with no sticky sessions required.

### Database

MongoDB's document model scales well for trade data. For higher load:

- Add indexes on `userId` and `status` fields in the `trades` collection (already implied by query patterns)
- Use MongoDB Atlas with auto-scaling clusters for managed horizontal scaling
- Consider read replicas for analytics/reporting queries

### API Versioning

All routes are mounted under `/api/v1/`. Future breaking changes can be introduced under `/api/v2/` without disrupting existing clients.

### Rate Limiting

For production, add `express-rate-limit` middleware to protect auth endpoints (`/api/v1/auth/register`, `/api/v1/auth/login`) from brute-force attacks.

## Frontend Scalability

### Next.js App Router

The App Router supports React Server Components, enabling server-side rendering and static generation per route. As the app grows:

- Dashboard pages can use ISR (Incremental Static Regeneration) for cached stats
- Heavy components can be lazy-loaded with `next/dynamic`

### API Client Isolation

All backend communication is centralized in `frontend/lib/api.ts`. Switching the backend URL, adding auth headers, or introducing a CDN/proxy layer requires changes in one file only.

## Observability

For production readiness, consider adding:

- **Logging**: Replace `console.error` with a structured logger (e.g., `pino`) in the backend
- **Metrics**: Expose a `/health` endpoint for uptime monitoring
- **Error tracking**: Integrate Sentry in both backend and frontend for real-time error reporting

## Future Enhancements

| Enhancement | Approach |
|---|---|
| Real-time P&L updates | WebSocket layer (Socket.io) alongside the REST API |
| Trade import (CSV) | Background job queue (BullMQ + Redis) |
| Multi-currency support | Extend `ITrade` schema; add exchange rate service |
| Email notifications | Transactional email service (Resend, SendGrid) |
| 2FA | TOTP via `speakeasy`; store secret on User model |
