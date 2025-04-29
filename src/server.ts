import express from 'express';
import dotenv from 'dotenv';
import authRoutes from '../src/routes/auth.routes';

dotenv.config();

const app = express();
app.use(express.json());

app.use('/api/auth', authRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
