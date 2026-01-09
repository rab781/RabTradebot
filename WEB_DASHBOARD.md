# 🌐 Web Dashboard untuk Trading Bot

## Overview
Web dashboard real-time untuk memantau trading bot Anda dengan visualisasi data, signals, news, dan portfolio tracking.

## Features

### 📊 Real-Time Monitoring
- **Portfolio Value**: Total nilai portfolio dengan P&L
- **Win Rate**: Persentase trade yang profitable
- **Open Positions**: Jumlah posisi yang masih aktif
- **Latest Signals**: Signal trading terbaru

### 📈 Data Visualization
- **Performance Chart**: Grafik performa portfolio
- **Current Positions**: Tabel posisi dengan P&L detail
- **Recent Signals**: History signal dengan confidence level
- **Latest News**: News feed dengan sentiment analysis
- **Trade History**: Riwayat trade dengan profit/loss

### 🔌 WebSocket Integration
Dashboard menggunakan Socket.IO untuk real-time updates:
- Otomatis update saat ada trade baru
- Live signal notifications
- Real-time news feed
- Portfolio value updates

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

Dependencies yang diperlukan:
- `express` - Web server
- `socket.io` - Real-time communication
- `cors` - Cross-origin resource sharing
- `@types/express` - TypeScript types
- `@types/cors` - TypeScript types

### 2. Configure Environment
Tambahkan port untuk web server di `.env` (opsional):
```env
WEB_PORT=3000
```

Default port adalah 3000 jika tidak diset.

### 3. Build Project
```bash
npm run build
```

### 4. Start Bot dengan Web Dashboard
```bash
npm run dev
```

atau untuk production:
```bash
npm start
```

### 5. Akses Dashboard
Buka browser dan akses:
```
http://localhost:3000
```

## API Endpoints

Dashboard menyediakan REST API untuk data bot:

### GET /api/dashboard
Mendapatkan semua data dashboard
```json
{
  "trades": [...],
  "signals": [...],
  "news": [...],
  "portfolio": {...},
  "stats": {...},
  "openTrades": [...]
}
```

### GET /api/trades?limit=50
Mendapatkan history trade
```json
[
  {
    "id": "uuid",
    "symbol": "BTCUSDT",
    "action": "BUY",
    "price": 45000,
    "quantity": 0.1,
    "timestamp": "2026-01-09T...",
    "profit": 100,
    "status": "CLOSED"
  }
]
```

### GET /api/trades/open
Mendapatkan open trades saja

### GET /api/signals?limit=20
Mendapatkan trading signals
```json
[
  {
    "symbol": "BTCUSDT",
    "action": "BUY",
    "price": 45000,
    "confidence": 0.85,
    "timestamp": "2026-01-09T...",
    "indicators": {
      "rsi": 35,
      "macd": { "value": 100, "signal": 80 }
    }
  }
]
```

### GET /api/news?limit=20
Mendapatkan news feed
```json
[
  {
    "symbol": "BTCUSDT",
    "title": "Bitcoin breaks $50k resistance",
    "sentiment": "BULLISH",
    "impact": "HIGH",
    "timestamp": "2026-01-09T..."
  }
]
```

### GET /api/portfolio
Mendapatkan portfolio info
```json
{
  "totalValue": 10500,
  "positions": [
    {
      "symbol": "BTCUSDT",
      "quantity": 0.2,
      "averagePrice": 45000,
      "currentPrice": 47000,
      "pnl": 400,
      "pnlPercentage": 4.44
    }
  ],
  "performance": {
    "totalPnl": 500,
    "totalPnlPercentage": 5.0,
    "winRate": 0.75,
    "totalTrades": 20
  }
}
```

### GET /api/stats
Mendapatkan bot statistics
```json
{
  "uptime": 3600000,
  "totalCommands": 150,
  "activeUsers": 5,
  "lastUpdate": "2026-01-09T..."
}
```

### GET /api/health
Health check endpoint
```json
{
  "status": "OK",
  "timestamp": "2026-01-09T...",
  "uptime": 3600
}
```

## WebSocket Events

### Client → Server
Tidak ada event khusus dari client saat ini (read-only dashboard).

### Server → Client

#### `dashboard`
Dikirim saat koneksi pertama kali
```javascript
{
  trades: [...],
  signals: [...],
  news: [...],
  portfolio: {...},
  stats: {...},
  openTrades: [...]
}
```

#### `trade`
Real-time notification saat ada trade baru
```javascript
{
  id: "uuid",
  symbol: "BTCUSDT",
  action: "BUY",
  price: 45000,
  quantity: 0.1,
  timestamp: "2026-01-09T...",
  status: "OPEN"
}
```

#### `signal`
Real-time notification saat ada signal baru
```javascript
{
  symbol: "BTCUSDT",
  action: "BUY",
  price: 45000,
  confidence: 0.85,
  timestamp: "2026-01-09T...",
  indicators: {...}
}
```

#### `news`
Real-time notification saat ada news baru
```javascript
{
  symbol: "BTCUSDT",
  title: "...",
  sentiment: "BULLISH",
  impact: "HIGH",
  timestamp: "2026-01-09T..."
}
```

#### `portfolio`
Update portfolio saat ada perubahan
```javascript
{
  totalValue: 10500,
  positions: [...],
  performance: {...}
}
```

## Architecture

### Components

1. **BotStateManager** (`src/services/botStateManager.ts`)
   - Central state management
   - Event emitter untuk real-time updates
   - Data storage (in-memory)

2. **Web Server** (`src/webServer.ts`)
   - Express REST API
   - Socket.IO WebSocket server
   - Static file serving

3. **Dashboard Frontend** (`public/index.html`)
   - Single page application
   - Chart.js untuk visualisasi
   - Socket.IO client untuk real-time

4. **Enhanced Bot** (`src/enhancedBot.ts`)
   - Telegram bot integration
   - Broadcasts events ke state manager

### Data Flow

```
Telegram Bot Command
       ↓
Enhanced Bot Processing
       ↓
State Manager Update
       ↓
Event Emission
       ↓
WebSocket Broadcast
       ↓
Dashboard Update (Real-time)
```

## Customization

### Mengubah Port
Edit `.env`:
```env
WEB_PORT=8080
```

### Mengubah Theme
Edit `public/index.html` bagian CSS:
```css
background: linear-gradient(135deg, #your-color-1 0%, #your-color-2 100%);
```

### Menambah Data Point
1. Update `BotStateManager` untuk track data baru
2. Tambah API endpoint di `webServer.ts`
3. Update dashboard untuk display data

## Security Considerations

⚠️ **PENTING**: Dashboard ini tidak memiliki authentication!

Untuk production:
1. Tambahkan authentication middleware
2. Gunakan HTTPS
3. Restrict CORS ke domain tertentu
4. Implementasikan rate limiting
5. Jangan expose ke public internet tanpa protection

## Troubleshooting

### Dashboard tidak terbuka
- Pastikan port 3000 tidak digunakan aplikasi lain
- Check console untuk error messages
- Pastikan build berhasil (`npm run build`)

### Data tidak update real-time
- Check browser console untuk WebSocket errors
- Pastikan bot sudah terkoneksi
- Refresh halaman untuk reconnect

### Chart tidak muncul
- Pastikan Chart.js CDN terload
- Check browser console untuk errors
- Clear browser cache

## Development

### Run in Development Mode
```bash
npm run dev
```

Auto-reload saat ada perubahan file.

### Build untuk Production
```bash
npm run build
npm start
```

### Test API Endpoints
```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/dashboard
curl http://localhost:3000/api/stats
```

## Future Enhancements

- [ ] Authentication & authorization
- [ ] Multi-user support dengan isolated data
- [ ] Historical data charts
- [ ] Trade execution dari dashboard
- [ ] Mobile responsive design
- [ ] Dark/light theme toggle
- [ ] Export data to CSV/JSON
- [ ] Push notifications
- [ ] Advanced filtering & search
- [ ] Performance analytics dashboard

## Support

Jika ada masalah:
1. Check console logs (bot & browser)
2. Pastikan semua dependencies terinstall
3. Verify `.env` configuration
4. Check port availability

---

**Happy Trading! 🚀📈**
