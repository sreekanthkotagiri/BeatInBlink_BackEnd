import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const ACCESS_SECRET = process.env.JWT_SECRET || 'accesssecret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refreshsecret';

export const generateAccessToken = (user: { id: string; role: string }) => {
  return jwt.sign(user, ACCESS_SECRET, { expiresIn: '15m' });
};

export const generateRefreshToken = (user: { id: string; role: string }) => {
  return jwt.sign(user, REFRESH_SECRET, { expiresIn: '7d' });
};

export const verifyAccessToken = (token: string) => {
  return jwt.verify(token, ACCESS_SECRET);
};

export const verifyRefreshToken = (token: string) => {
  return jwt.verify(token, REFRESH_SECRET);
};
