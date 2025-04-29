import express from 'express';
import { verifyToken } from '../middleware/verifyToken';

const router = express.Router();

router.get('/dashboard', verifyToken, (req, res) => {
  const user = (req as any).user;
  res.json({
    message: `Welcome ${user.role}!`,
    userId: user.userId
  });
});

export default router;
