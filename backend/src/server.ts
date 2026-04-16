import 'dotenv/config';
import app from './app';
import connectDB from './config/db';

const PORT = process.env.PORT || 5000;

const start = async (): Promise<void> => {
  // Start Express first so Swagger UI is always reachable
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Swagger UI: http://localhost:${PORT}/api/docs`);
  });

  // Attempt DB connection in the background — server stays up either way
  connectDB().catch((err: unknown) => {
    console.warn('MongoDB not connected (DB-dependent routes will fail):', err);
  });
};

start().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
