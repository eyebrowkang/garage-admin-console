import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

type AuthenticatedRequest = Request & { user?: string | jwt.JwtPayload | undefined };

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, env.jwtSecret, (err, user) => {
    if (err || !user) return res.sendStatus(403);
    (req as AuthenticatedRequest).user = user;
    next();
  });
}
