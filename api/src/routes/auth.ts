import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';

const router = Router();

const LoginSchema = z.object({
  password: z.string(),
});

router.post('/login', (req, res) => {
  try {
    const { password } = LoginSchema.parse(req.body);

    if (password !== env.adminPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ role: 'admin' }, env.jwtSecret, { expiresIn: '1d' });
    res.json({ token });
  } catch {
    res.status(400).json({ error: 'Invalid request' });
  }
});

export default router;
