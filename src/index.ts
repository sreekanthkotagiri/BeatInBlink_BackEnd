import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import authRoutes from './routes/auth.routes';
import protectedRoutes from './routes/protected';


// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',  // allow only frontend origin
  credentials: true                 // allow cookies/auth headers
}));
app.use(express.json());

// PostgreSQL connection
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test DB connection
db.connect()
  .then(() => console.log('✅ Connected to PostgreSQL'))
  .catch(err => console.error('❌ DB connection error', err));

// Sample route
app.get('/', (_req, res) => {
  res.send('EduExamine API is running 🎓');
});

app.use('/api/protected', protectedRoutes);
app.use('/api/auth', authRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
