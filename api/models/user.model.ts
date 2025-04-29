import { db } from '../config/db';

export const findUserByEmail = async (email: string) => {
  const res = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  return res.rows[0];
};

export const createUser = async (email: string, password: string, role: string) => {
  const res = await db.query(
    'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING *',
    [email, password, role]
  );
  return res.rows[0];
};

export const updatePassword = async (email: string, password: string) => {
  await db.query('UPDATE users SET password = $1 WHERE email = $2', [password, email]);
};
