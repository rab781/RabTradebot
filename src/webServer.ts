/**
 * Web Server untuk Trading Bot Dashboard
 * Menyediakan REST API dan WebSocket untuk real-time updates
 */

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import path from 'path';
import os from 'os';
import BotStateManager from './services/botStateManager';

const PORT = Number(process.env.WEB_PORT || 3000);
const HOST = process.env.WEB_HOST || '0.0.0.0';

const app = express();
const httpServer = createServer(app);

// 🛡️ Sentinel: Restrict CORS origin to prevent unauthorized access (High Priority: Overly permissive CORS)
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
          .map(origin => origin.trim())
          .filter(origin => origin.length > 0)
    : [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
const corsOptions = {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
};

const io = new SocketIOServer(httpServer, {
    cors: corsOptions,
});

const stateManager = BotStateManager.getInstance();

// Trust the immediate upstream proxy so req.ip reflects the real client IP from X-Forwarded-For
app.set('trust proxy', 1);

// Apply CORS globally before the rate limiter so that 429 responses on /api/* also include CORS
// headers, preventing browsers from misreporting a rate-limit rejection as a CORS error.
app.use(cors(corsOptions));

// 🛡️ Sentinel: Custom bounded in-memory rate limiter to prevent DoS attacks (High Priority: Missing rate limiting)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;
const MAX_MAP_CAPACITY = 5000;

app.use('/api/', (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (record && record.resetTime > now) {
        if (++record.count > MAX_REQUESTS_PER_WINDOW) {
            res.status(429).json({ error: 'Too Many Requests' });
            return;
        }
    } else {
        if (rateLimitMap.size >= MAX_MAP_CAPACITY) {
            // Evict expired entries to prevent memory exhaustion
            for (const [key, val] of rateLimitMap.entries()) {
                if (val.resetTime <= now) rateLimitMap.delete(key);
            }
            // If still at capacity, delete the oldest inserted entry (FIFO eviction)
            if (rateLimitMap.size >= MAX_MAP_CAPACITY) {
                rateLimitMap.delete(rateLimitMap.keys().next().value as string);
            }
        }
        rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    }
    next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API Routes

// Get dashboard data
app.get('/api/dashboard', (req: Request, res: Response) => {
    try {
        const data = stateManager.getDashboardData();
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get trades
app.get('/api/trades', (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const trades = stateManager.getTrades(limit);
        res.json(trades);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get open trades
app.get('/api/trades/open', (req: Request, res: Response) => {
    try {
        const openTrades = stateManager.getOpenTrades();
        res.json(openTrades);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get signals
app.get('/api/signals', (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const signals = stateManager.getSignals(limit);
        res.json(signals);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get news
app.get('/api/news', (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const news = stateManager.getNews(limit);
        res.json(news);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get portfolio
app.get('/api/portfolio', (req: Request, res: Response) => {
    try {
        const portfolio = stateManager.getPortfolio();
        res.json(portfolio);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get bot stats
app.get('/api/stats', (req: Request, res: Response) => {
    try {
        const stats = stateManager.getStats();
        res.json(stats);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
    res.json({
        status: 'OK',
        timestamp: new Date(),
        uptime: process.uptime(),
    });
});

// WebSocket connection
io.on('connection', (socket: Socket) => {
    console.log('🔌 Client connected to dashboard');

    // Send initial data
    socket.emit('dashboard', stateManager.getDashboardData());

    // Listen to state changes and broadcast
    stateManager.on('trade', (trade: any) => {
        io.emit('trade', trade);
    });

    stateManager.on('signal', (signal: any) => {
        io.emit('signal', signal);
    });

    stateManager.on('news', (news: any) => {
        io.emit('news', news);
    });

    stateManager.on('portfolio', (portfolio: any) => {
        io.emit('portfolio', portfolio);
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected from dashboard');
    });
});

// Start server
export function startWebServer() {
    httpServer.listen(PORT, HOST, () => {
        const interfaces = os.networkInterfaces();
        const lanIp = Object.values(interfaces)
            .flat()
            .find((iface) => iface && iface.family === 'IPv4' && !iface.internal)?.address;

        console.log(`🌐 Web Dashboard running at http://localhost:${PORT}`);
        if (lanIp) {
            console.log(`🌐 LAN Access: http://${lanIp}:${PORT}`);
        }
        console.log(`📊 API available at http://localhost:${PORT}/api`);
        console.log(`🔌 WebSocket ready for real-time updates`);
    });
}

export { io, stateManager };
