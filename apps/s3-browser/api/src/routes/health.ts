import { type Router as RouterType, Router } from 'express';

const router: RouterType = Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 's3-browser', timestamp: new Date() });
});

export default router;
