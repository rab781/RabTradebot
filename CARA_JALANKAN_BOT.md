# Phase 2 Enhanced Bot - Panduan Menjalankan Bot

## 🚀 Cara Menjalankan Bot

### Method 1: Langsung dengan ts-node (Recommended)

```bash
npx ts-node src/phase2EnhancedBot.ts
```

### Method 2: Build dan Run

```bash
npm run build
npm start
```

### Method 3: Development Mode dengan Watch

```bash
npm run dev
```

### Method 4: Background Mode (PowerShell)

```powershell
Start-Process -NoNewWindow -FilePath "npx" -ArgumentList "ts-node", "src/phase2EnhancedBot.ts"
```

## 📱 Testing di Telegram

### Step 1: Buka Telegram

1. Buka aplikasi Telegram
2. Cari username bot yang Anda buat di BotFather
3. Atau klik link yang diberikan BotFather

### Step 2: Mulai Percakapan

```
/start
```

### Step 3: Test Commands

```
/help                    - Lihat semua commands
/demo                    - Demo bot
/system                  - Status sistem
/mlpredict BTC          - AI prediction untuk Bitcoin
/ensemble ETH           - Ensemble analysis untuk Ethereum
/sentiment DOGE         - Sentiment analysis untuk Dogecoin
/mlstats                - Statistik ML models
```

## ✅ Status Bot Saat Ini

🤖 **Bot Status**: RUNNING ✅
🧠 **ML Services**: ALL OPERATIONAL ✅
📊 **Commands**: REGISTERED ✅
🔧 **Configuration**: LOADED ✅

## 🎯 Commands yang Tersedia

### Phase 1 Commands:

- `/demo` - Demo trading analysis
- `/risk [symbol]` - Risk analysis
- `/performance [symbol]` - Performance metrics
- `/status` - Bot status
- `/celebrate` - Celebrate success

### Phase 2 ML Commands:

- `/mlpredict [symbol]` - Complete ML prediction
- `/ensemble [symbol]` - Ensemble strategy
- `/randomforest [symbol]` - Random Forest signals
- `/lstm [symbol]` - LSTM neural network
- `/sentiment [symbol]` - Sentiment analysis
- `/mlanalysis [symbol]` - Comprehensive analysis
- `/mlstats` - ML statistics
- `/marketregime` - Market regime detection

### System Commands:

- `/help` - Show all commands
- `/system` - Complete system status

## 🔧 Troubleshooting

### Jika Bot Tidak Respond:

1. Cek apakah bot masih running:

   ```bash
   Get-Process -Name "node" | Format-Table
   ```

2. Restart bot:

   ```bash
   npx ts-node src/phase2EnhancedBot.ts
   ```

3. Cek log untuk errors di terminal

### Jika Commands Tidak Bekerja:

1. Pastikan token Telegram benar di .env
2. Cek apakah bot sudah di-start di Telegram dengan /start
3. Gunakan /help untuk melihat available commands

## 📞 Support

Jika ada masalah:

1. Cek terminal output untuk error messages
2. Pastikan .env file configured dengan benar
3. Restart bot jika diperlukan
