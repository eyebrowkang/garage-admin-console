import express, { type Express } from 'express';

import healthRouter from './routes/health.js';

export const app: Express = express();

app.use(express.json());

// Public routes
app.use('/api/health', healthRouter);

// Placeholder: S3 proxy routes will be added here
// app.use('/api/s3', authenticateToken, s3Router);
