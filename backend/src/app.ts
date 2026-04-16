import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import v1Router from './routes/v1/index';
import { errorMiddleware } from './middleware/error.middleware';

const app = express();

// ── Core middleware ──────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  })
);

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api/v1', v1Router);

// ── Swagger UI ───────────────────────────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ── Global error handler (must be last) ─────────────────────────────────────
app.use(errorMiddleware);

export default app;
