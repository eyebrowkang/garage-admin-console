import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
const app = express();
const PORT = process.env.PORT || 3001;
import clusterRouter from './routes/clusters.js';
import authRouter from './routes/auth.js';
import proxyRouter from './routes/proxy.js';
import { authenticateToken } from './middleware/auth.middleware.js';
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
// Public routes
app.use('/auth', authRouter);
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});
// Protected routes
app.use('/clusters', authenticateToken, clusterRouter);
app.use('/proxy', authenticateToken, proxyRouter);
app.listen(PORT, () => {
    console.log(`BFF API running on http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map