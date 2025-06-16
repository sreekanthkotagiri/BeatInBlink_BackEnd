import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import authRoutes from './routes/auth.routes';
import protectedRoutes from './routes/protected';
import { Request, Response } from 'express';

dotenv.config();

const app = express();

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'https://beatinblink.com',
  'https://www.beatinblink.com',
  'https://beat-in-blink-ui.vercel.app' // Optional: clean production domain
];

// Add dynamic frontend URL if defined in environment variables
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// PostgreSQL connection
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  }
});

db.connect()
  .then(() => console.log('✅ Connected to PostgreSQL'))
  .catch(err => console.error('❌ DB connection error', err));

// Routes
app.get('/', (_req: Request, res: Response) => {
  res.send('EduExamine API is running 🎓');
});

app.use('/api/protected', protectedRoutes);
app.use('/api/auth', authRoutes);

// ------------------------------
// 👇 Dual mode: local + Vercel
// ------------------------------

if (process.env.VERCEL === undefined) {
  // Local development mode
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running locally on http://localhost:${PORT}`);
  });
}

// Export handler for Vercel
export default function handler(req: any, res: any) {
  app(req, res);
}