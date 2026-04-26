/**
 * Web Server untuk Trading Bot Dashboard
 * Menyediakan REST API dan WebSocket untuk real-time updates
 */

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import os from 'os';
import BotStateManager from './services/botStateManager';
import { healthMonitor } from './services/healthMonitor';
import { withLogContext } from './utils/logger';

const PORT = Number(process.env.WEB_PORT || 3000);
const HOST = process.env.WEB_HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by'); // 🛡️ Sentinel: Disable x-powered-by to prevent information disclosure
const httpServer = createServer(app);

// 🛡️ Sentinel: Restrict CORS origin to prevent unauthorized access (High Priority: Overly permissive CORS)
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0)
    : [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
const corsOptions = {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
};

const io = new SocketIOServer(httpServer, {
    cors: corsOptions,
});

const stateManager = BotStateManager.getInstance();

// Middleware

// 🛡️ Sentinel: Add essential security headers manually to avoid external dependencies
app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:;"); // 🛡️ Sentinel: Add CSP
    res.setHeader('X-XSS-Protection', '1; mode=block'); // 🛡️ Sentinel: Add X-XSS-Protection
    next();
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' })); // 🛡️ Sentinel: Prevent Payload DoS by bounding JSON size
app.use(express.static(path.join(__dirname, '../public')));

// 🛡️ Sentinel: Custom manual rate limiter (High Priority: Missing rate limiting)
// Bound Map size to prevent Memory DoS.
const MAX_IPS = 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 100;
const ipRequests = new Map<string, { count: number; resetTime: number }>();

const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of ipRequests.entries()) {
        if (now > data.resetTime) {
            ipRequests.delete(ip);
        }
    }
}, RATE_LIMIT_WINDOW_MS);
cleanupInterval.unref(); // Prevent interval from keeping event loop alive

const rateLimiterMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let requestData = ipRequests.get(ip);
    if (!requestData || now > requestData.resetTime) {
        if (ipRequests.size >= MAX_IPS) {
            // Evict an old entry or clear if too large
            const firstKey = ipRequests.keys().next().value;
            if (firstKey) ipRequests.delete(firstKey);
        }
        requestData = { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
        ipRequests.set(ip, requestData);
    }

    requestData.count++;
    if (requestData.count > MAX_REQUESTS_PER_WINDOW) {
        res.status(429).json({ error: 'Too many requests, please try again later.' });
        return;
    }
    next();
};

app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API Routes
app.use('/api', rateLimiterMiddleware);

// Get dashboard data
app.get('/api/dashboard', (req: Request, res: Response) => {
    try {
        const data = stateManager.getDashboardData();
        res.json(data);
    } catch (error: any) {
        withLogContext({ service: 'webServer' }).error(`Dashboard API error: ${error.message}`);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// Get trades
app.get('/api/trades', (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const trades = stateManager.getTrades(limit);
        res.json(trades);
    } catch (error: any) {
        withLogContext({ service: 'webServer' }).error(`Trades API error: ${error.message}`);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// Get open trades
app.get('/api/trades/open', (req: Request, res: Response) => {
    try {
        const openTrades = stateManager.getOpenTrades();
        res.json(openTrades);
    } catch (error: any) {
        withLogContext({ service: 'webServer' }).error(`Open trades API error: ${error.message}`);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// Get signals
app.get('/api/signals', (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const signals = stateManager.getSignals(limit);
        res.json(signals);
    } catch (error: any) {
        withLogContext({ service: 'webServer' }).error(`Signals API error: ${error.message}`);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// Get news
app.get('/api/news', (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const news = stateManager.getNews(limit);
        res.json(news);
    } catch (error: any) {
        withLogContext({ service: 'webServer' }).error(`News API error: ${error.message}`);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// Get portfolio
app.get('/api/portfolio', (req: Request, res: Response) => {
    try {
        const portfolio = stateManager.getPortfolio();
        res.json(portfolio);
    } catch (error: any) {
        withLogContext({ service: 'webServer' }).error(`Portfolio API error: ${error.message}`);
        res.status(500).json({ error: 'An internal server error occurred' });
    }
});

// Get bot stats
app.get('/api/stats', (req: Request, res: Response) => {
    try {
        const stats = stateManager.getStats();
        res.json(stats);
    } catch (error: any) {
        withLogContext({ service: 'webServer' }).error(`Stats API error: ${error.message}`);
        res.status(500).json({ error: 'An internal server error occurred' });
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

// F6-11: External monitoring endpoint
app.get('/health', (req: Request, res: Response) => {
    const snapshot = healthMonitor.getSnapshot();
    const stats = stateManager.getStats();

    const payload = {
        status: snapshot.overallStatus,
        timestamp: new Date(snapshot.timestamp).toISOString(),
        uptime: snapshot.uptime,
        memoryUsageMb: snapshot.memoryUsageMb,
        requestCount: stats.totalCommands,
        components: snapshot.components,
    };

    const httpCode = snapshot.overallStatus === 'down' ? 503 : 200;
    res.status(httpCode).json(payload);
});

// WebSocket connection
io.on('connection', (socket) => {
    withLogContext({ service: 'webServer' }).info('Client connected to dashboard');

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
        withLogContext({ service: 'webServer' }).info('Client disconnected from dashboard');
    });
});

// Start server
export function startWebServer() {
    httpServer.listen(PORT, HOST, () => {
        const interfaces = os.networkInterfaces();
        const lanIp = Object.values(interfaces)
            .flat()
            .find((iface) => iface && iface.family === 'IPv4' && !iface.internal)?.address;

        withLogContext({ service: 'webServer', data: { port: PORT, host: HOST } }).info(
            `Web Dashboard running at http://localhost:${PORT}`
        );
        if (lanIp) {
            withLogContext({ service: 'webServer', data: { lanIp, port: PORT } }).info(
                `LAN Access: http://${lanIp}:${PORT}`
            );
        }
        withLogContext({ service: 'webServer' }).info(
            `API available at http://localhost:${PORT}/api`
        );
        withLogContext({ service: 'webServer' }).info('WebSocket ready for real-time updates');
    });
}

export { io, stateManager };
