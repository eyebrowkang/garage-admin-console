import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin'; // Default password should be changed!

const LoginSchema = z.object({
    password: z.string(),
});

router.post('/login', (req, res) => {
    try {
        const { password } = LoginSchema.parse(req.body);

        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
        res.json({ token });
    } catch (error) {
        res.status(400).json({ error: 'Invalid request' });
    }
});

export default router;
