import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import authRoutes from './routes/auth.routes';
import protectedRoutes from './routes/protected';
import { VercelRequest, VercelResponse } from '@vercel/node';

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',  // Update for prod if needed
  credentials: true
}));
app.use(express.json());

// PostgreSQL connection
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // for hosted PostgreSQL like ElephantSQL
  }
});

// Connect and log once (optional)
db.connect()
  .then(() => console.log('✅ Connected to PostgreSQL'))
  .catch(err => console.error('❌ DB connection error', err));

// Routes
app.get('/', (_req, res) => {
  res.send('EduExamine API is running 🎓');
});
app.use('/api/protected', protectedRoutes);
app.use('/api/auth', authRoutes);

// Export Express as handler (Vercel-compatible)
export default (req: VercelRequest, res: VercelResponse) => {
  app(req as any, res as any);
};
