import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import errorHandler from './middleware/errorHandler';

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic Health Check Route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', message: 'Backend service is running' });
});

import v1Router from './api/v1'; // Import the v1 router

// Placeholder for API routes
// app.use('/api/v1', apiRoutes);
app.use('/api/v1', v1Router); // Use the v1 router for all /api/v1 routes

// Global Error Handler
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Backend server is listening on port ${port}`);
});

export default app;
