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
  'https://beatinblink.com',
  'https://www.beatinblink.com',
  'https://beat-in-blink-ui.vercel.app',
  // General patterns for local development and online IDEs
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
  /^http:\/\/0\.0\.0\.0:\d+$/,
  /^https:\/\/.*\.vercel\.app$/,
  /^https:\/\/.*\.netlify\.app$/,
  /^https:\/\/.*\.herokuapp\.com$/,
  /^https:\/\/.*\.webcontainer\.io(?::\d+)?$/,
  /^https:\/\/.*\.stackblitz\.io$/,
  /^https:\/\/.*\.staticblitz\.com(?::\d+)?$/,
  /^https:\/\/.*\.bolt\.new(?::\d+)?$/,
  /^https:\/\/.*\.codesandbox\.io$/,
  /^https:\/\/.*\.csb\.app(?::\d+)?$/,
  /^https:\/\/.*\.gitpod\.io$/,
  /^https:\/\/.*\.replit\.dev$/,
  /^https:\/\/.*\.repl\.co(?::\d+)?$/
];

// Add dynamic frontend URL if defined in environment variables
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin matches any of the allowed origins (including regex patterns)
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return allowedOrigin === origin;
      } else if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log(`CORS blocked origin: ${origin}`);
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
  res.json({ message: 'EduExamine API is running' });
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

// Export app directly for Vercel
export default app;