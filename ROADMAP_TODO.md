# 🗺️ ROADMAP TODO — RabTradebot Quant Trading Bot

> **Target:** Dari 50/100 → 100/100 Full Quant Trading Bot → 130/100 (Elite Tier)
> **Estimasi Total:** ~10 Minggu
> **Last Updated:** 2026-04-10

---

## 📊 Progress Overview

| Fase | Nama | Status | Bobot | Progress |
|------|------|--------|-------|----------|
| 0 | Critical Bug Fixes | ✅ Done | +2 pts | 100% |
| 1 | Real Order Execution | ✅ Done | +20 pts | 100% |
| 2 | Realistic Paper Trading | ✅ Done | +8 pts | 100% |
| 3 | Real-time WebSocket | ✅ Done | +7 pts | 100% |
| 4 | ML Pipeline Improvement | ✅ Done | +8 pts | 100% |
| 5 | Strategy Optimization | ✅ Done | +8 pts | 100% |
| 6 | Production Infrastructure | ✅ Done | +3 pts | 100% |
| 7 | Multi-Agent LLM Intelligence | ⏳ Pending | +10 pts | 0% |
| 8 | Web Dashboard (Kinetic Observatory) | ⏳ Pending | +10 pts | 0% |
| 9 | Analysis Pipeline Hardening | ⏳ Pending | +5 pts | 0% |
| 10 | News Intelligence Upgrade | ⏳ Pending | +5 pts | 0% |

**Scorecard Saat Ini: 97 / 100** ✅ (Fase 0 + Fase 1 + Fase 2 + Fase 3 + Fase 4 + Fase 5 + Fase 6 complete)

> **Note:** Fase 7 menambah dimensi baru sistem (LLM-based multi-agent reasoning). Total target nilai naik dari 100 → ~110/100 (bonus tier).
> **Note:** Fase 8 menambah Web Dashboard berbasis Stitch design system ("Kinetic Observatory"). Target akhir: **120/100** (ultra bonus tier).
> **Note:** Fase 9 & 10 ditambahkan berdasarkan **analisis output bot real (2026-04-10)** — memperbaiki pipeline analisis yang sudah berjalan. Target tertinggi: **130/100** (elite tier).

---

## ⚡ FASE 0 — Critical Bug Fixes

> **Estimasi:** 1 Hari
> **Prioritas:** 🔴 WAJIB DIKERJAKAN PERTAMA
> **Target Score:** 52 / 100
> **Catatan audit repo (2026-03-17):** Beberapa item Fase 0 sudah terpenuhi di codebase saat ini. Checklist di bawah hanya disesuaikan dengan kondisi repo tanpa mengubah inti roadmap.

### Bugs Kritis

- [x] **[F0-1]** Pindahkan `@prisma/client` dari `devDependencies` ke `dependencies` di `package.json`
  - File: `package.json`
  - Status audit: sudah ada di `dependencies`

- [x] **[F0-2]** Tambahkan `url = env("DATABASE_URL")` ke `datasource db` di Prisma schema
  - File: `prisma/schema.prisma`
  - Status audit: baris `url = env("DATABASE_URL")` sudah ada

- [x] **[F0-3]** Perbaiki `DATABASE_URL` di `.env` dan sambungkan ke `databaseService.ts`
  - File: `.env`, `.env.example`, `src/services/databaseService.ts`
  - **Sudah dikerjakan:** `.env` tidak punya `DATABASE_URL` sama sekali → ditambahkan `DATABASE_URL="file:./prisma/dev.db"`
  - **Fix:** `getPrisma()` sekarang membaca `process.env.DATABASE_URL || 'file:./prisma/dev.db'`
  - `DATABASE_URL` ditambahkan juga ke `.env.example` dengan komentar untuk production PostgreSQL

- [x] **[F0-4]** Perbaiki `SignalGenerator` agar menghasilkan structured signal output
  - File: `src/services/signalGenerator.ts`, `src/enhancedBot.ts`
  - **Sudah dikerjakan:** ditambahkan interface `SignalResult { action, price, stopLoss, takeProfit, confidence, reason, text }`
  - Return type diubah dari `Promise<string>` → `Promise<SignalResult>`; data struktural diambil langsung dari `newsAnalysis` (bukan parse teks)
  - `enhancedBot.ts` diupdate: `signal.action`, `signal.price`, `signal.confidence` menggantikan substring parsing + hardcode 0.75

- [x] **[F0-5]** Hapus atau gunakan dependency `node-binance-api` yang tidak terpakai
  - File: `package.json`
  - Status audit: dependency `node-binance-api` sudah tidak ada di `package.json`

- [x] **[F0-6]** Persist state paper trading ke database saat setiap perubahan
  - File: `src/services/paperTradingEngine.ts`, `src/services/databaseService.ts`
  - **Sudah dikerjakan:**
  - **Bug 1 fix:** `createTrade()` sekarang menyimpan dengan `status: 'PAPER_OPEN', notes: 'PAPER_TRADE'` agar bisa dibedakan dari live trade
  - **Bug 2 fix:** `databaseService.closeTrade()` — profit direction cek diperluas ke `side === 'BUY' || side === 'LONG'` ✅
  - **Bug 3 fix:** Method `restoreStateFromDB()` ditambahkan; dipanggil dari `start()` setelah `botStart()` — open positions di-load ulang dari DB ke memory saat restart
  - `findOpenTrade()` dan `saveTrade()` di `databaseService.ts` diperluas dengan parameter `status` optional
  - Method baru `getOpenPaperTrades(userId, symbol?)` ditambahkan ke `DatabaseService`

- [x] **[F0-7]** Downgrade `express` dari `^5.2.1` (beta) ke `^4.21.0` (stable)
  - File: `package.json`
  - Status audit: repo sudah memakai Express 4.x stable

- [x] **[F0-8]** Jalankan `prisma generate` setelah fix schema
  - Status audit: `npx prisma generate` sudah pernah dijalankan — `node_modules/.prisma/client/index.js` ada ✅
  - Migrasi schema sudah ada di `prisma/migrations/` ✅
  - Sisa pekerjaan terkait DB ada di **F0-3** (sambungkan `DATABASE_URL` ke service)

---

## 🔵 FASE 1 — Real Order Execution

> **Estimasi:** 1–2 Minggu
> **Prioritas:** 🔴 Tertinggi — Core dari Quant Trading
> **Target Score:** 70 / 100

### 1.1 BinanceOrderService (File Baru)

- [x] **[F1-1]** Buat file `src/services/binanceOrderService.ts`

- [x] **[F1-2]** Implementasi `placeMarketOrder(symbol, side, quantity)`
  - Endpoint: `POST /api/v3/order`
  - Parameter: `{ symbol, side, type: 'MARKET', quantity }`
  - Return: `{ orderId, status, executedQty, price }`

- [x] **[F1-3]** Implementasi `placeLimitOrder(symbol, side, quantity, price)`
  - Endpoint: `POST /api/v3/order`
  - Parameter: `{ symbol, side, type: 'LIMIT', quantity, price, timeInForce: 'GTC' }`

- [x] **[F1-4]** Implementasi `placeStopLossLimitOrder(symbol, side, quantity, stopPrice, limitPrice)`
  - Endpoint: `POST /api/v3/order`
  - Parameter: `{ type: 'STOP_LOSS_LIMIT', stopPrice, price, timeInForce: 'GTC' }`

- [x] **[F1-5]** Implementasi `placeTakeProfitLimitOrder(symbol, side, quantity, stopPrice, limitPrice)`
  - Endpoint: `POST /api/v3/order`
  - Parameter: `{ type: 'TAKE_PROFIT_LIMIT' }`

- [x] **[F1-6]** Implementasi `cancelOrder(symbol, orderId)`
  - Endpoint: `DELETE /api/v3/order`

- [x] **[F1-7]** Implementasi `cancelAllOpenOrders(symbol)`
  - Endpoint: `DELETE /api/v3/openOrders`

- [x] **[F1-8]** Implementasi `getOpenOrders(symbol?)`
  - Endpoint: `GET /api/v3/openOrders`

- [x] **[F1-9]** Implementasi `getOrderStatus(symbol, orderId)`
  - Endpoint: `GET /api/v3/order`

- [x] **[F1-10]** Implementasi `getCurrentPrice(symbol)`
  - Endpoint: `GET /api/v3/ticker/price`
  - Ini untuk polling cepat sebelum WebSocket tersedia (Fase 3)

- [x] **[F1-11]** Implementasi `getAccountBalance()`
  - Endpoint: `GET /api/v3/account`
  - Return hanya non-zero balances

- [x] **[F1-12]** Implementasi `getSymbolInfo(symbol)`
  - Endpoint: `GET /api/v3/exchangeInfo`
  - Return: `{ minQty, maxQty, stepSize, minNotional, tickSize }`
  - Dipakai untuk validasi order sebelum dikirim

- [x] **[F1-13]** Implementasi `roundToStepSize(quantity, stepSize)` — helper function
  - Binance menolak order jika quantity tidak mengikuti `stepSize` exact
  - Contoh: stepSize=0.001, quantity=0.0015123 → 0.001

- [x] **[F1-14]** Tambah rate limiter di `BinanceOrderService`
  - Max 1200 request/menit (weight-based)
  - Setiap request catat weight-nya berdasarkan tipe endpoint
  - Jika mendekati limit → auto throttle

- [x] **[F1-15]** Tambah retry logic dengan exponential backoff
  - Retry 3x untuk error `429` (rate limit) dan `5xx` (server error)
  - Delay: 1s, 2s, 4s
  - Jangan retry untuk error `-2010` (insufficient balance) atau `-1121` (invalid symbol)

### 1.2 RealTradingEngine (File Baru)

- [x] **[F1-16]** Buat file `src/services/realTradingEngine.ts`

- [x] **[F1-17]** Implementasi `executeEntry(signal, riskParams)`
  - Hitung `quantity` berdasarkan `riskParams.riskPerTrade` dan `stopLoss` distance
  - Panggil `binanceOrderService.roundToStepSize()` sebelum kirim
  - Kirim market order via `binanceOrderService.placeMarketOrder()`
  - Simpan trade ke DB dengan `orderId` Binance
  - Kirim konfirmasi ke Telegram user

- [x] **[F1-18]** Implementasi `executeExit(tradeId, reason)`
  - Fetch trade dari DB
  - Cancel semua pending orders terkait trade ini
  - Kirim market order sisi berlawanan
  - Update trade di DB: `exitPrice`, `exitTime`, `profit`, `status: CLOSED`
  - Kirim laporan profit/loss ke Telegram user

- [x] **[F1-19]** Implementasi position sizing via Kelly Criterion
  - Formula: `f = (edge * odds - (1 - edge)) / odds`
  - Edge = win rate dari backtest terbaru
  - Batasi dengan `maxPositionSize` dari OpenClawConfig
  - Minimum position = `minPositionSize`

- [x] **[F1-20]** Validasi sebelum eksekusi order
  - Cek saldo cukup (`getAccountBalance()`)
  - Cek jumlah open trades tidak melebihi `maxOpenTrades`
  - Cek simbol valid (`getSymbolInfo()`)
  - Cek minimum notional (`quantity * price >= minNotional`)

### 1.3 Risk Management Loop (File Baru)

- [x] **[F1-21]** Buat file `src/services/riskMonitorLoop.ts`

- [x] **[F1-22]** Implementasi main monitoring loop (polling REST, 5 detik interval)
  - Fetch semua open trades dari DB
  - Untuk setiap trade: fetch current price
  - Cek stop loss, take profit, trailing stop
  - Jika triggered → panggil `realTradingEngine.executeExit()`

- [x] **[F1-23]** Implementasi trailing stop logic
  - Track `highestPrice` sejak entry untuk LONG, `lowestPrice` untuk SHORT
  - Hitung trailing stop berdasarkan `trailingStopPositive` dari strategy config
  - Update `stoplossRate` di DB setiap kali harga baru lebih menguntungkan

- [x] **[F1-24]** Implementasi portfolio-level circuit breaker
  - Jika total account drawdown > threshold (default 15%) → stop semua trading otomatis
  - Kirim alert darurat ke Telegram admin
  - Semua open positions di-close dengan market order

- [x] **[F1-25]** Tambah `riskMonitorLoop.start()` dan `stop()` di bot startup/shutdown

### 1.4 Integrasi ke Bot Telegram

- [x] **[F1-26]** Tambah command `/livetrade start <symbol>` di `enhancedBot.ts`
  - Gunakan `OpenClawStrategy` sebagai default
  - Konfirmasi dari user sebelum mulai (karena uang nyata)
  - Tampilkan disclaimer risiko

- [x] **[F1-27]** Tambah command `/livetrade stop` di `enhancedBot.ts`

- [x] **[F1-28]** Tambah command `/liveportfolio` — lihat posisi live + unrealized PnL

- [x] **[F1-29]** Tambah command `/orders` — lihat open orders di Binance real-time

- [x] **[F1-30]** Tambah command `/cancelorder <orderId>` — cancel order spesifik

- [x] **[F1-31]** Tambah notifikasi otomatis saat:
  - Order tereksekusi (entry/exit)
  - Stop loss terpicu
  - Take profit tercapai
  - Error eksekusi

### 1.5 Testing Fase 1

- [x] **[F1-32]** Buat `scripts/test-order-service.ts` — test semua fungsi order dengan Testnet Binance
- [ ] **[F1-33]** Daftarkan akun di Binance Testnet: `https://testnet.binance.vision`
  - Catatan: langkah manual di luar codebase
- [x] **[F1-34]** Tambah `BINANCE_TESTNET=true` dan `BINANCE_TESTNET_URL` ke `.env.example` (dan gunakan di `.env` runtime)
- [x] **[F1-35]** Test full flow: signal → entry order → risk monitor → exit order

---

## 🟡 FASE 2 — Paper Trading yang Realistis

> **Estimasi:** 3–5 Hari
> **Prioritas:** 🟡 Menengah
> **Target Score:** 78 / 100

### 2.1 Slippage Modeling

- [x] **[F2-1]** Buat helper `calculateSlippage(price, side, quantity, avgVolume20)` di `paperTradingEngine.ts`
  - Volume impact: `(quantity / avgVolume20) * 0.001` (0.1% per 1x average volume)
  - Random component: `±0.05%` gaussian noise
  - Total: `slippage = volumeImpact + randomComponent`
  - BUY: `fillPrice = price * (1 + slippage)`
  - SELL: `fillPrice = price * (1 - slippage)`

- [x] **[F2-2]** Integrasikan `calculateSlippage()` ke `createTrade()` dan `closeTrade()`

- [x] **[F2-3]** Tambah `slippage` field ke `PaperTradingResult` dan tampilkan di `/performance`

### 2.2 Bid/Ask Spread Simulation

- [x] **[F2-4]** Buat lookup table spread per kategori pair:
  - BTC/USDT: 0.01%
  - ETH/USDT, BNB/USDT: 0.015%
  - Large cap altcoin: 0.03%
  - Small cap altcoin: 0.1%

- [x] **[F2-5]** Terapkan spread: BUY di ask price (+spread/2), SELL di bid price (-spread/2)

### 2.3 Liquidity Constraint

- [x] **[F2-6]** Hitung `avgVolume20` dari candle data saat ini
- [x] **[F2-7]** Jika `orderSize > avgVolume20 * 0.01` (1% dari avg volume) → partial fill atau reject
- [x] **[F2-8]** Simulasi partial fill: fill maksimum 1% avg volume, sisanya pending

### 2.4 Persist State ke Database

- [x] **[F2-9]** Simpan setiap open paper trade ke tabel `Trade` dengan field `notes: "PAPER_TRADE"`
- [x] **[F2-10]** Baca kembali open paper trades dari DB saat `PaperTradingEngine.start()` dipanggil
- [x] **[F2-11]** Update DB setiap kali posisi berubah (trailing stop update, unrealized PnL)
- [x] **[F2-12]** Simpan `performanceHistory` ke DB berkala (setiap 10 iterasi)

### 2.5 Peningkatan Reporting

- [x] **[F2-13]** Tambah kolom `slippageCost` dan `spreadCost` di laporan paper trading
- [x] **[F2-14]** Tambah equity curve chart di command `/performance` (gunakan `imageChartService`)
- [x] **[F2-15]** Tambah perbandingan "dengan slippage" vs "tanpa slippage" di hasil akhir

---

## ✅ FASE 3 — Real-time Data dengan WebSocket *(Selesai: 2026-03-18)*

> **Estimasi:** 3–5 Hari
> **Prioritas:** 🟡 Menengah
> **Target Score:** 85 / 100
> **Status:** ✅ **SELESAI** — 4 Sprint | 47 Tests Passed | TypeScript Clean

### 3.1 BinanceWebSocketService (File Baru)

- [x] **[F3-1]** Install dependency: `npm install ws @types/ws`
  - Status audit: `ws` dan `@types/ws` sudah ada di `package.json`

- [x] **[F3-2]** Buat file `src/services/binanceWebSocketService.ts`

- [x] **[F3-3]** Implementasi `subscribeTickerStream(symbol, callback)`
  - URL: `wss://stream.binance.com:9443/ws/<symbol>@ticker`
  - Callback dipanggil setiap update harga (< 1 detik)
  - Data: `{ symbol, lastPrice, bidPrice, askPrice, volume, priceChangePercent }`

- [x] **[F3-4]** Implementasi `subscribeKlineStream(symbol, interval, callback)`
  - URL: `wss://stream.binance.com:9443/ws/<symbol>@kline_<interval>`
  - Callback dipanggil setiap candle update
  - Saat `kline.isClosed === true` → trigger strategy evaluation

- [x] **[F3-5]** Implementasi `subscribeUserDataStream(listenKey, callbacks)`
  - URL: `wss://stream.binance.com:9443/ws/<listenKey>`
  - Handles: `outboundAccountPosition` (balance update), `executionReport` (order update)
  - Penting untuk mengetahui kapan order di-fill tanpa polling

- [x] **[F3-6]** Implementasi `getListenKey()` — request listen key dari `POST /api/v3/userDataStream`

- [x] **[F3-7]** Implementasi `keepAliveListenKey()` — ping setiap 30 menit agar listen key tidak expired

- [x] **[F3-8]** Implementasi auto-reconnect WebSocket
  - Jika koneksi putus → tunggu 1s → reconnect
  - Jika gagal 5x berturut-turut → kirim alert ke Telegram admin
  - Max reconnect delay: 30 detik (exponential backoff)

- [x] **[F3-9]** Implementasi `unsubscribe(symbol)` dan `unsubscribeAll()`

### 3.2 Integrasi WebSocket ke Risk Monitor

- [x] **[F3-10]** Update `riskMonitorLoop.ts` — ganti polling REST 5 detik ke WebSocket ticker callback
- [x] **[F3-11]** Harga update real-time dari WebSocket langsung trigger pengecekan SL/TP
- [x] **[F3-12]** Gunakan `executionReport` dari User Data Stream untuk konfirmasi fill otomatis

### 3.3 Auto-Signal dari Kline Close

- [x] **[F3-13]** Saat `kline.isClosed === true` dari `subscribeKlineStream()`:
  - Ambil data historis terbaru dari `dataManager`
  - Jalankan `strategy.populateIndicators()` → `populateEntryTrend()`
  - Jika ada sinyal BUY/SELL → kirim notifikasi Telegram ke semua subscriber
  - Jika live trading aktif → langsung eksekusi via `realTradingEngine`

- [x] **[F3-14]** Tambah command `/subscribe <symbol>` — user minta auto-alert sinyal
- [x] **[F3-15]** Tambah command `/unsubscribe <symbol>` — stop auto-alert

### 3.4 Connection Manager

- [x] **[F3-16]** Buat `src/services/connectionManager.ts` yang mengelola semua WebSocket streams
- [x] **[F3-17]** Batasi maksimum 5 stream aktif sekaligus (limit Binance)
- [x] **[F3-18]** Tampilkan status semua stream aktif di command `/apistatus`

### 📋 Ringkasan Fase 3

| Sprint | File | Tests |
|--------|------|------|
| S1 — WS Core | `src/services/binanceWebSocketService.ts` (NEW) | ✅ 14/14 |
| S2 — Manager | `src/services/connectionManager.ts` (NEW) | ✅ 18/18 |
| S3 — Risk Monitor | `src/services/riskMonitorLoop.ts` (UPDATED) | ✅ 15/15 |
| S4 — Telegram | `src/enhancedBot.ts` (UPDATED) | — |
| **Total** | **110/110 All Tests** | **TypeScript: 0 errors** |

---

## ✅ FASE 4 — ML Pipeline Improvement *(Selesai: 2026-03-25)*

> **Estimasi:** 1–2 Minggu
> **Prioritas:** 🟡 Menengah — Meningkatkan Edge
> **Target Score:** 93 / 100

### 4.1 Walk-Forward Validation

- [x] **[F4-1]** Buat method `walkForwardValidate(data, windowSize, stepSize)` di `SimpleGRUModel`
  - `windowSize`: jumlah candle untuk training (misal: 2000)
  - `stepSize`: geser window per iterasi (misal: 200)
  - Hasilkan array akurasi per window, lalu rata-ratakan

- [x] **[F4-2]** Simpan hasil WFV ke tabel `MLModelMetric` dengan `modelVersion` yang berbeda per window

- [x] **[F4-3]** Tampilkan ringkasan WFV di command `/mlstats`:
  - Akurasi rata-rata WFV
  - Akurasi terbaik / terburuk
  - Stabilitas (standar deviasi antar window)

### 4.2 Proper Data Split

- [x] **[F4-4]** Perbaiki training pipeline di `scripts/production-training.ts`:
  - 70% train, 15% validation, 15% test
  - Split berdasarkan waktu (bukan random) — hindari data leakage
  - Simpan indeks split ke file config agar reproducible

- [x] **[F4-5]** Implementasi early stopping berdasarkan validation loss
  - Stop training jika val_loss tidak membaik dalam 5 epoch berturut-turut
  - Simpan model terbaik (bukan yang terakhir)

- [x] **[F4-6]** Laporkan akurasi pada test set yang terpisah setelah training selesai
  - Test set TIDAK BOLEH digunakan untuk tuning apapun
  - Ini adalah angka akurasi yang "jujur"

### 4.3 Arsitektur Model yang Lebih Baik

- [x] **[F4-7]** Update arsitektur GRU di `src/ml/simpleGRUModel.ts`:
  - Layer 1: `GRU(64 units)` + `Dropout(0.3)`
  - Layer 2: `GRU(32 units)` + `Dropout(0.2)`
  - Layer 3: `Dense(16, activation: 'relu')` + `Dropout(0.1)`
  - Output: `Dense(3, activation: 'softmax')` — 3 kelas: UP, DOWN, NEUTRAL

- [x] **[F4-8]** Ganti loss function dari `meanSquaredError` ke `categoricalCrossentropy`
  - Sesuai karena output sekarang adalah klasifikasi 3 kelas, bukan regresi

- [x] **[F4-9]** Tambah `class_weight` untuk handle imbalanced dataset
  - Jika UP:DOWN:NEUTRAL = 40:30:30, berikan weight lebih ke kelas minoritas

- [ ] **[F4-10]** Implementasi `Attention Mechanism` sederhana di atas GRU layer terakhir (opsional, bonus)

### 4.4 Confidence Calibration

- [x] **[F4-11]** Ganti confidence formula dari `Math.abs(outputNeuron)` ke probabilitas softmax
  - Confidence = `max(softmax_output)` — nilai antara 0 dan 1 yang valid secara probabilistik

- [x] **[F4-12]** Implementasi **Platt Scaling** untuk kalibrasi confidence
  - Latih logistic regression kecil di atas raw model output menggunakan validation set
  - Hasilnya: confidence 70% benar-benar berarti 70% akurat secara historis

- [x] **[F4-13]** Buat `calibrationTest()` — tampilkan reliability diagram (confidence vs actual accuracy per bucket)

### 4.5 Multi-timeframe Features

- [x] **[F4-14]** Tambah fitur dari timeframe 15m ke `FeatureEngineeringService`:
  - RSI 14 (15m), MACD histogram (15m), BB %B (15m), volume ratio (15m)
  - Selaraskan timestamp dengan candle 1h (binary search)

- [x] **[F4-15]** Tambah fitur dari timeframe 4h:
  - RSI 14 (4h), EMA 50 (4h), trend direction (4h), ATR % (4h)

- [x] **[F4-16]** Update `featureCount` di `SimpleGRUModel` sesuai jumlah fitur baru (60 → 68)

### 4.6 Peningkatan Training Pipeline

- [x] **[F4-17]** Update `scripts/production-training.ts` agar menggunakan WFV secara default
- [x] **[F4-18]** Tambah logging per-epoch (loss, val_loss, accuracy per epoch)
- [x] **[F4-19]** Simpan hyperparameter training ke `models/training_hyperparams.json` (JSON)
- [x] **[F4-20]** Update command `/mlstats` tampilkan Fase 4 WFV summary dari Telegram

### 📋 Ringkasan Fase 4

| Sprint | File | Tests |
|--------|------|-------|
| S1 — Arsitektur + Data Split | `src/ml/simpleGRUModel.ts` (UPDATED) | ✅ 32/32 |
| S2 — Walk-Forward Validation | `src/ml/simpleGRUModel.ts` (method baru) | ✅ 23/23 |
| S3 — Confidence + Multi-TF | `src/services/featureEngineering.ts` (UPDATED) | ✅ 15/15 |
| S4 — Training Pipeline | `scripts/production-training.ts` (UPDATED), `src/enhancedBot.ts` | — |
| **Total** | **3 files utama diupdate** | **✅ 70/70 All Tests** | **TypeScript: 0 errors** |

---

## 🟣 FASE 5 — Strategy Optimization yang Robust

> **Estimasi:** 1 Minggu
> **Prioritas:** 🟢 Menengah-Rendah
> **Target Score:** 97 / 100

### 5.1 Walk-Forward Optimization (WFO)

- [ ] **[F5-1]** Tambah method `walkForwardOptimize(data, inSampleRatio, numWindows)` di `StrategyOptimizer`
  - `inSampleRatio`: misal 0.7 → 70% data untuk optimasi, 30% untuk validasi
  - `numWindows`: jumlah window WFO (misal: 5)
  - Setiap window: optimasi → validasi → catat degradasi performa

- [ ] **[F5-2]** Pilih parameter yang "paling stabil" antar window, bukan yang terbaik di satu window
  - Metrik stabilitas: `outOfSampleScore / inSampleScore` (mendekati 1.0 = tidak overfit)

- [ ] **[F5-3]** Simpan hasil WFO per window ke `BacktestResult` dengan tag `wfo_window_N`

- [ ] **[F5-4]** Tampilkan summary WFO di command `/optimize`:
  - Parameter terbaik per window
  - Stabilitas keseluruhan
  - Rekomendasi parameter final

### 5.2 Bayesian Optimization

- [ ] **[F5-5]** Install library: `npm install ml-bayesian-optimization` atau implementasi TPE sederhana

- [ ] **[F5-6]** Buat `BayesianOptimizer` class di `src/services/bayesianOptimizer.ts`
  - Gantikan grid search sebagai metode default
  - Grid search tetap tersedia sebagai fallback / untuk parameter space kecil

- [ ] **[F5-7]** Implementasi **Tree Parzen Estimator (TPE)**:
  - Bagi riwayat evaluasi menjadi "good" (top 25%) dan "bad" (bottom 75%)
  - Modelkan distribusi parameter untuk kedua grup dengan kernel density estimation
  - Pilih parameter berikutnya yang memaksimalkan rasio `p(good) / p(bad)`

- [ ] **[F5-8]** Bandingkan efisiensi Bayesian vs Grid search di command `/optimize`:
  - Jumlah evaluasi yang diperlukan untuk mencapai skor yang sama

### 5.3 Monte Carlo Robustness Test

- [ ] **[F5-9]** Buat `monteCarloTest(trades, numSimulations)` di `StrategyOptimizer`
  - Shuffle urutan trade N kali (default: 1000 simulasi)
  - Hitung profit, max drawdown, Sharpe untuk setiap simulasi
  - Hasilkan distribusi: P5, P25, median, P75, P95

- [ ] **[F5-10]** Tampilkan hasil Monte Carlo di output `/optimize`:
  - "Dalam 95% skenario, max drawdown < X%"
  - "Dalam 5% skenario terburuk, profit = Y%"

### 5.4 Multi-Objective Optimization

- [ ] **[F5-11]** Tambah mode optimasi "Pareto Frontier" — tampilkan trade-off antara:
  - Return vs Drawdown
  - Win Rate vs Profit Factor
  - Biarkan user pilih titik di Pareto frontier sesuai preferensi risiko

---

## ⚫ FASE 6 — Production Infrastructure

> **Estimasi:** 1 Minggu
> **Prioritas:** 🟢 Menengah-Rendah
> **Target Score:** 100 / 100

### 6.1 Migrasi Database

- [x] **[F6-1]** Buat Prisma schema variant untuk PostgreSQL
  - Duplikat `prisma/schema.prisma` → `prisma/schema.postgres.prisma`
  - Ganti `provider = "sqlite"` → `provider = "postgresql"`
  - Tambah `@db.Text` untuk kolom JSON (trades, equityCurve, parameters)
  - **Update 2026-03-26:** file `prisma/schema.postgres.prisma` sudah ditambahkan.

- [x] **[F6-2]** Buat script migrasi data SQLite → PostgreSQL
  - File: `scripts/migrate-sqlite-to-postgres.ts`
  - Export semua data dari SQLite → Import ke PostgreSQL
  - **Update 2026-03-26:** script migrasi sudah ditambahkan dengan mode `MIGRATION_DRY_RUN`, dukungan batch insert, dan opsi truncate target.

- [ ] **[F6-3]** Install TimescaleDB extension untuk tabel `HistoricalData`
  - Konversi tabel `HistoricalData` menjadi hypertable berdasarkan `timestamp`
  - Buat index time-series yang optimal

- [x] **[F6-4]** Tambah connection pooling via `PgBouncer` atau `prisma.$connect()` pool config
  - Max pool size: 10 connections
  - Connection timeout: 5 detik
  - **Update 2026-03-26:** `databaseService.ts` menambahkan auto pool tuning untuk PostgreSQL via query params (`connection_limit`, `pool_timeout`) + flag `PGBOUNCER_ENABLED`.

### 6.2 Rate Limiter Terpusat

- [x] **[F6-5]** Buat `src/services/rateLimiter.ts`
  - Implementasi **Token Bucket Algorithm**
  - REST API: 1200 request weight per menit
  - Order API: 10 orders per detik, 100.000 orders per hari
  - WebSocket: max 5 stream per connection, max 300 subscriptions

- [x] **[F6-6]** Integrate `rateLimiter` ke semua fungsi di `BinanceOrderService`

- [x] **[F6-7]** Tambah `X-MBX-USED-WEIGHT` parsing dari response header Binance
  - Update token bucket berdasarkan weight yang dikonfirmasi server

### 6.3 Health Monitoring & Auto-Alert

- [x] **[F6-8]** Buat `src/services/healthMonitor.ts`

- [x] **[F6-9]** Monitor dan alert ke Telegram admin jika:
  - Bot crash atau restart tidak terduga
  - Koneksi Binance terputus > 30 detik
  - WebSocket disconnect > 3 kali dalam 10 menit
  - Account drawdown melewati threshold (default 10%)
  - Model GRU akurasi drop di bawah 50% (7 hari rolling)
  - Saldo akun di bawah minimum operasional

- [x] **[F6-10]** Implementasi `/healthcheck` command di bot
  - Tampilkan status semua komponen: DB, Binance REST, WebSocket streams, ML model
  - Tampilkan uptime, memory usage, request count

- [x] **[F6-11]** Buat endpoint HTTP `/health` di `webServer.ts` untuk monitoring eksternal
  - Return JSON: `{ status: 'ok'|'degraded'|'down', components: {...}, uptime: N }`
  - Bisa diintegrasikan dengan UptimeRobot atau Grafana

### 6.4 Structured Logging & Audit Trail

- [x] **[F6-12]** Implementasi structured logger menggunakan library `pino` atau `winston`
  - Install: `npm install pino pino-pretty`
  - Log format: JSON dengan fields: `timestamp`, `level`, `service`, `userId`, `symbol`, `message`, `data`
  - Log level berbeda per environment: `debug` (development), `info` (production)

- [x] **[F6-13]** Ganti semua `console.log` dan `console.error` di `src/` dengan structured logger
  - Buat wrapper: `logger.info()`, `logger.warn()`, `logger.error()`, `logger.debug()`

- [x] **[F6-14]** Setiap aksi trading WAJIB dicatat ke tabel `ErrorLog` dengan level `INFO`:
  - Order dikirim (params, timestamp)
  - Order confirmed/filled (executedPrice, quantity, fee)
  - SL/TP terpicu (reason, price)
  - Strategy signal generated (signal strength, indicators)

- [x] **[F6-15]** Tambah command `/logs <N>` — tampilkan N log terakhir ke Telegram admin

### 6.5 Process Management & Deployment

- [x] **[F6-16]** Setup PM2 untuk process management
  - Buat `ecosystem.config.js` di root project
  - Config: auto-restart on crash, max memory restart (512MB), cluster mode
  - Log rotation: max 30 hari, max 100MB per file

- [x] **[F6-17]** Buat script deployment otomatis `scripts/deploy.sh`:
  ```
  git pull origin main
  npm ci --production
  npx prisma migrate deploy
  npm run build
  pm2 restart rabtradebot
  ```

- [x] **[F6-18]** Setup environment yang benar:
  - `.env.development` — Binance Testnet, SQLite, log level debug
  - `.env.production` — Binance Mainnet, PostgreSQL, log level info
  - Jangan pernah commit file `.env` ke git (pastikan di `.gitignore`)

- [x] **[F6-19]** Buat `Dockerfile` untuk containerized deployment (opsional)
  - Base image: `node:20-alpine`
  - Multi-stage build: builder → runner
  - Volume mount untuk database dan model files
  - **Update 2026-03-26:** `Dockerfile` multi-stage + `.dockerignore` sudah ditambahkan.

### 6.6 Unit Testing & Coverage

- [x] **[F6-20]** Buat unit test untuk `BinanceOrderService`
  - File: `tests/binanceOrderService.test.ts`
  - Mock semua HTTP calls dengan `jest.mock` atau `nock`
  - Test: round to step size, signature generation, error handling
  - **Update 2026-03-26:** coverage item terpenuhi oleh suite existing `tests/fase1-order-service.test.ts` (passing di full test run).

- [x] **[F6-21]** Buat unit test untuk `RiskMonitorLoop`
  - File: `tests/riskMonitorLoop.test.ts`
  - Test: SL trigger, TP trigger, trailing stop logic, circuit breaker
  - **Update 2026-03-26:** coverage item terpenuhi oleh suite existing `tests/fase1-risk-monitor.test.ts` (passing di full test run).

- [x] **[F6-22]** Buat unit test untuk `FeatureEngineeringService`
  - File: `tests/featureEngineering.test.ts`
  - Test: output dimensi benar, tidak ada NaN/Infinity, cache berfungsi
  - **Update 2026-03-26:** suite baru ditambahkan dan lulus (`6/6` saat dijalankan bersama `backtestEngine.test.ts`).

- [x] **[F6-23]** Buat unit test untuk `BacktestEngine`
  - File: `tests/backtestEngine.test.ts`
  - Test: Sharpe ratio calculation, drawdown calculation, ROI check logic
  - **Update 2026-03-26:** suite baru ditambahkan untuk profit path, stoploss trigger, dan no-trade stability.

- [x] **[F6-24]** Target coverage minimum 80% (sudah dikonfigurasi di `package.json`)
  - Jalankan: `npm test -- --coverage`
  - **Update 2026-03-26:** full coverage run lulus dengan threshold global aktif (Jest coverage thresholds enforced).

---

## 🤖 FASE 7 — Multi-Agent LLM Intelligence

> **Estimasi:** 1–2 Minggu
> **Prioritas:** 🟡 Menengah — High-Impact untuk Edge Signal Quality
> **Target Score:** Bonus +10 pts (110/100)
> **Referensi:** [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) — framework Multi-Agent LLM trading dari paper arXiv:2412.20138
> **LLM Provider:** Chutes AI (`CHUTES_API_KEY` sudah ada di `.env`) — gunakan model Qwen, Kimi, atau model lain yang tersedia
> **Note:** Fase ini berdiri sendiri, tidak memblokir Fase 1–6. Bisa dikerjakan paralel dengan Fase 3+.

### 7.1 Infrastruktur LLM Agent (Foundation)

- [ ] **[F7-1]** Buat file `src/services/ai/llmClient.ts` — wrapper adapter untuk Chutes AI
  - Konfigurasi base URL, API key (`CHUTES_API_KEY`) dari `.env`
  - Method: `chat(messages, model, temperature)` → return string
  - Support multi-model: Qwen 3, Kimi, dan model Chutes AI lainnya
  - Sertakan retry logic dan timeout (max 30 detik per request)

- [ ] **[F7-2]** Buat file `src/services/ai/promptTemplates.ts` — kumpulan prompt yang digunakan oleh seluruh LLM agent
  - Template: `TECHNICAL_ANALYST_PROMPT`, `SENTIMENT_ANALYST_PROMPT`, `NEWS_ANALYST_PROMPT`
  - Template: `BULLISH_RESEARCHER_PROMPT`, `BEARISH_RESEARCHER_PROMPT`, `TRADER_AGENT_PROMPT`
  - Setiap prompt menerima variabel konteks (harga, indikator, berita, dll.) via `{}'` placeholder

- [ ] **[F7-3]** Buat file `src/services/ai/agentContext.ts` — interface dan tipe data yang dibagikan antar agent
  - Interface `AgentMessage { role: string, content: string }`
  - Interface `MarketContext { symbol, currentPrice, indicators, recentNews, mlSignal, taSignal }`
  - Interface `AgentDecision { action: 'BUY'|'SELL'|'HOLD', confidence: number, reasoning: string }`

### 7.2 Analyst Team (LLM Paralel)

- [ ] **[F7-4]** Buat file `src/services/ai/analysts/technicalAnalystAgent.ts`
  - Input: `MarketContext` (harga, RSI, MACD, BB, ATR, signal dari TA strategy)
  - Kirim ke LLM: deskripsikan kondisi indikator saat ini, minta interpretasi dan outlook
  - Output: `{ analysis: string, bias: 'bullish'|'bearish'|'neutral', confidence: number }`

- [ ] **[F7-5]** Buat file `src/services/ai/analysts/sentimentAnalystAgent.ts`
  - Input: feed berita/sentimen terkini (dari `newsAnalysis` di `signalGenerator.ts`)
  - Minta LLM: ekstrak sentimen pasar secara kuantitatif (skor -1 hingga +1)
  - Output: `{ sentimentScore: number, summary: string, topDrivers: string[] }`

- [ ] **[F7-6]** Buat file `src/services/ai/analysts/newsAnalystAgent.ts`
  - Input: headline kripto terbaru (gunakan data yang sudah ada dari Chutes/LLM di `signalGenerator.ts`)
  - Minta LLM: identifikasi event macro yang bisa mempengaruhi harga dalam 1–4 jam ke depan
  - Output: `{ impact: 'high'|'medium'|'low', direction: 'positive'|'negative'|'neutral', summary: string }`

- [ ] **[F7-7]** Buat file `src/services/ai/analysts/mlInterpretationAgent.ts`
  - Input: raw output dari `SimpleGRUModel` (softmax probabilities, confidence)
  - Minta LLM: interpretasikan prediksi model dalam bahasa natural
  - Output: `{ interpretation: string, agreement: boolean }` (agent setuju/tidak dengan ML model)

### 7.3 Researcher Team (LLM Debate)

- [ ] **[F7-8]** Buat file `src/services/ai/researchers/bullishResearcherAgent.ts`
  - Input: output ringkasan dari seluruh Analyst (TA, Sentiment, News, ML)
  - Tugasnya: **argumen kenapa harus BUY** — cari fakta dari analis yang mendukung long position
  - Output: `{ argument: string, strength: 1-10, keyPoints: string[] }`

- [ ] **[F7-9]** Buat file `src/services/ai/researchers/bearishResearcherAgent.ts`
  - Input: sama dengan Bullish Researcher
  - Tugasnya: **argumen kenapa harus SELL atau HOLD** — cari fakta yang mendukung posisi defensif
  - Output: `{ argument: string, strength: 1-10, keyPoints: string[] }`

- [ ] **[F7-10]** Implementasi `debateRound(bullishArg, bearishArg, rounds)` di `src/services/ai/researchers/debateOrchestrator.ts`
  - Jalankan N putaran debat (default: `maxDebateRounds = 1` untuk efisiensi biaya)
  - Setiap putaran: masing-masing pihak merespons argumen pihak lain
  - Output setelah semua putaran: `{ winnerBias: 'bullish'|'bearish'|'neutral', finalSummary: string }`

### 7.4 Trader & Portfolio Manager

- [ ] **[F7-11]** Buat file `src/services/ai/traderAgent.ts`
  - Input: ringkasan debat dari `debateOrchestrator` + konteks portofolio saat ini (saldo, open trades)
  - Tugasnya: konversi debat menjadi proposal trading yang konkret
  - Output: `{ action: 'BUY'|'SELL'|'HOLD', suggestedSize: number, suggestedSL: number, suggestedTP: number, reasoning: string }`

- [ ] **[F7-12]** Buat file `src/services/ai/portfolioManagerAgent.ts`
  - Input: proposal dari `traderAgent` + status risiko dari `riskMonitorLoop`
  - Tugasnya: **approve atau reject** proposal — periksa apakah proposalnya konsisten dengan risk parameters
  - Jika approved: forward ke `realTradingEngine` atau `paperTradingEngine`
  - Jika rejected: kirim penjelasan ke Telegram
  - Output: `{ decision: 'APPROVED'|'REJECTED', reason: string }`

### 7.5 Orkestrasi Multi-Agent Pipeline

- [ ] **[F7-13]** Buat file `src/services/ai/multiAgentOrchestrator.ts` — entry point seluruh pipeline
  - Method: `runAnalysis(symbol, marketContext)` → return `AgentDecision`
  - Urutan eksekusi:
    1. Jalankan **4 Analyst** secara paralel (`Promise.all`) untuk efisiensi
    2. Kumpulkan hasil → susun ringkasan
    3. Jalankan **Bullish & Bearish Researcher** secara paralel
    4. Jalankan `debateRound()`
    5. Jalankan **Trader Agent**
    6. Jalankan **Portfolio Manager** (final gate)
  - Catat total waktu eksekusi dan biaya estimasi token ke log

- [ ] **[F7-14]** Integrasikan `multiAgentOrchestrator` ke `signalGenerator.ts`
  - Tambah flag `USE_MULTI_AGENT=true` di `.env`
  - Jika `true`: gunakan output dari Multi-Agent Orchestrator sebagai sinyal utama
  - Jika `false`: fallback ke GRU + TA rule-based seperti sebelumnya (backward-compatible)

### 7.6 Persistensi & Observability

- [ ] **[F7-15]** Simpan setiap sesi analisis multi-agent ke database
  - Buat tabel `AgentAnalysisLog` di Prisma schema: `id, symbol, timestamp, analystOutputs (JSON), debateSummary, finalDecision, executionTimeMs`

- [ ] **[F7-16]** Tambah command `/agentanalysis <symbol>` di `enhancedBot.ts`
  - Trigger satu sesi analisis langsung dari Telegram
  - Tampilkan ringkasan tiap agent: Technical Bias, Sentiment Score, News Impact, ML Interpretation
  - Tampilkan hasil debat dan keputusan akhir Portfolio Manager
  - *Note:* Command ini tidak langsung eksekusi order — hanya tampilkan analisis untuk review manual

- [ ] **[F7-17]** Tambah command `/agentlog <N>` — tampilkan N sesi analisis terakhir dari database
  - Tampilkan: timestamp, symbol, final decision, apakah dikonfirmasi jadi order

- [ ] **[F7-18]** Evaluasi dan catat akurasi keputusan Multi-Agent secara berkala
  - Bandingkan prediksi agent dengan hasil aktual harga (24 jam setelah sinyal)
  - Simpan ke `AgentAnalysisLog.actualOutcome: 'correct'|'incorrect'`
  - Tampilkan winrate agent di command `/mlstats`

### 7.7 Konfigurasi untuk Chutes AI

- [ ] **[F7-19]** Tambah environment variables Fase 7 ke `.env.example`:
  - `USE_MULTI_AGENT` — toggle fitur (true/false)
  - `CHUTES_MODEL_DEEP` — model untuk reasoning berat (misal: `qwen3-70b`, default: `Qwen/Qwen3-235B-A22B`)
  - `CHUTES_MODEL_QUICK` — model untuk tugas cepat (misal: `Qwen/Qwen3-30B-A3B`)
  - `MAX_DEBATE_ROUNDS` — jumlah putaran debat LLM (default: 1)
  - `AGENT_TIMEOUT_MS` — batas waktu per LLM call (default: 30000)

---

## 🌐 FASE 8 — Web Dashboard (Kinetic Observatory)

> **Estimasi:** 2–3 Minggu
> **Prioritas:** 🟡 Menengah — High-Impact untuk Observability & UX
> **Target Score:** Bonus +10 pts (120/100)
> **Design Reference:** Stitch Project ID `265577062322331843` — 4 screens desain sudah final
> **Note:** Fase ini **berdiri sendiri** dan bisa dikerjakan paralel dengan Fase 4-7. Mengekspos data bot ke dashboard visual premium yang sudah didesain di Stitch.
> **ADR:** Gunakan **Vite + TypeScript** untuk frontend, di-serve via `webServer.ts` yang sudah ada. WebSocket dari Fase 3 di-proxy ke browser untuk real-time data.

### 8.1 Backend REST API Endpoints (Foundation — Sprint Pertama)

- [ ] **[F8-1]** Perluas `src/webServer.ts` — tambah REST API router terpisah di `/api/*`
  - Gunakan Express Router agar tidak mengotori server utama
  - Middleware: CORS untuk dev, auth middleware via JWT

- [ ] **[F8-2]** Implementasi `GET /api/portfolio`
  - Return: `{ totalBalance, availableBalance, openPositions[], unrealizedPnL, marginUsed }`
  - Sumber data: `getAccountBalance()` + open trades dari DB

- [ ] **[F8-3]** Implementasi `GET /api/trades?status=open|closed&symbol=X&limit=N`
  - Return: array trade dengan field: `id, symbol, side, entryPrice, exitPrice, profit, status, duration`
  - Support pagination dengan `offset` query param

- [ ] **[F8-4]** Implementasi `GET /api/performance`
  - Return: `{ equityCurve[], sharpeRatio, maxDrawdown, totalReturn, winRate, profitFactor }`
  - Hitung dari semua closed trades di DB

- [ ] **[F8-5]** Implementasi `GET /api/backtest/results?strategy=X&limit=N`
  - Return: hasil `BacktestResult` terbaru per strategi dari DB
  - Field: `strategy, period, totalTrades, winRate, roi, sharpe, maxDrawdown, params`

- [ ] **[F8-6]** Implementasi `GET /api/signals?limit=N`
  - Return: riwayat sinyal terbaru dari `AgentAnalysisLog` (jika Fase 7 aktif) atau dari `SignalResult` log
  - Field: `timestamp, symbol, action, confidence, reasoning`

- [ ] **[F8-7]** Implementasi `GET /api/market/ticker?symbol=X`
  - Return: harga real-time dari cache WebSocket
  - Jika WS tidak aktif, fallback ke `getCurrentPrice()` REST

- [ ] **[F8-8]** Implementasi WebSocket endpoint `/ws/market`
  - Proxy price stream dari `BinanceWebSocketService` ke browser client
  - Format pesan: `{ type: 'ticker', symbol, price, change24h, volume }`
  - Auto-subscribe ke symbol yang diminta client

- [ ] **[F8-9]** Implementasi auth middleware sederhana
  - Route `/api/auth/token` — input: Telegram `user_id` + secret key
  - Return JWT token (expire 24 jam)
  - Semua `/api/*` route wajib valid JWT di header `Authorization: Bearer <token>`

### 8.2 Frontend Setup (Vite + TypeScript)

- [ ] **[F8-10]** Init Vite project di `src/web/`
  ```
  cd src/web && npx create-vite@latest . -- --template vanilla-ts
  ```
  - Build output ke `dist/web/` (buka dari `webServer.ts`)

- [ ] **[F8-11]** Implementasi Design System dari Stitch ke CSS
  - Buat `src/web/src/styles/design-system.css`
  - CSS variables sesuai `designTheme`: `--color-primary: #00F2FF`, dll.
  - Fonts: import Space Grotesk + Inter dari Google Fonts
  - Utility classes: `.surface`, `.surface-bright`, `.chip-buy`, `.chip-sell`

- [ ] **[F8-12]** Buat layout shell dengan sidebar navigasi
  - Sidebar: Logo RabTradebot, nav links ke 4 halaman, status bot (online/offline dot)
  - Layout mengikuti desain Stitch: sidebar kiri + main content kanan
  - Responsive: collapse sidebar di layar < 1200px

- [ ] **[F8-13]** Implementasi routing client-side (hash-based, tanpa framework)
  - Route: `#/dashboard`, `#/ai-analysis`, `#/backtesting`, `#/portfolio`
  - Lazy load setiap halaman via dynamic import

- [ ] **[F8-14]** Buat `ApiClient` class di `src/web/src/api/apiClient.ts`
  - Wrapper untuk semua HTTP calls ke `/api/*`
  - Auto-attach JWT token dari localStorage
  - Error handling: 401 → redirect ke login, 500 → show toast

- [ ] **[F8-15]** Buat `WebSocketClient` class di `src/web/src/api/wsClient.ts`
  - Connect ke `/ws/market`
  - Auto-reconnect dengan exponential backoff
  - Event emitter: `on('ticker', callback)`

### 8.3 Halaman 1 — Main Trading Dashboard

> **Reference:** Stitch Screen ID `616abb0c0959481492038ad05f78bcf3`

- [ ] **[F8-16]** Buat `src/web/src/pages/dashboard.ts`
  - **Widget: Live Price Ticker** — harga real-time via WebSocket, animasi flash saat harga berubah
  - **Widget: Account Balance** — total balance, available margin, unrealized PnL
  - **Widget: Open Positions** — tabel posisi aktif dengan unrealized PnL, SL/TP levels
  - **Widget: Recent Orders** — 10 order terakhir (filled, cancelled, pending)

- [ ] **[F8-17]** Implementasi live price chart (sparkline) untuk setiap open position
  - Gunakan library `lightweight-charts` (TradingView's library, open source)
  - Update chart secara real-time dari WebSocket data

- [ ] **[F8-18]** Implementasi "Quick Action" buttons
  - **[Close Position]** — kirim request ke bot via Telegram deep link
  - **[Set Alert]** — simpan price alert ke localStorage, notify via browser notification API

### 8.4 Halaman 2 — AI Analysis & Sentiment

> **Reference:** Stitch Screen ID `3937523f7d774ee7b5abaa5524abea64`

- [ ] **[F8-19]** Buat `src/web/src/pages/aiAnalysis.ts`
  - **Widget: Sentiment Gauge** — donut chart menunjukkan skor sentimen (-1 hingga +1)
  - **Widget: Agent Decision Card** — output terakhir dari multi-agent (jika Fase 7 aktif)
  - **Widget: Signal Timeline** — list sinyal terakhir dengan timestamp dan confidence bar
  - **Widget: ML Model Stats** — accuracy gauge, confusion matrix mini, win rate trend

- [ ] **[F8-20]** Implementasi "Trigger Analysis" button
  - Kirim request `POST /api/signals/trigger?symbol=X` ke backend
  - Backend memanggil `multiAgentOrchestrator.runAnalysis()` (jika Fase 7 aktif)
  - Show loading state selama analisis berjalan (polling `/api/signals` setiap 2 detik)

### 8.5 Halaman 3 — Backtesting & Strategy Lab

> **Reference:** Stitch Screen ID `cbb47c5408fd43ada3df476b8e7ed0a4`

- [ ] **[F8-21]** Buat `src/web/src/pages/backtesting.ts`
  - **Widget: Backtest Config Form** — input: symbol, timeframe, start/end date, strategy params
  - **Widget: Results Comparison Table** — semua backtest results dari DB, sortable
  - **Widget: Equity Curve Chart** — TradingView lightweight chart dari `equityCurve[]` data
  - **Widget: Trade Distribution** — bar chart: win/loss/BE per bulan

- [ ] **[F8-22]** Implementasi "Run Backtest" via API
  - `POST /api/backtest/run` — trigger backtest di backend
  - Polling hasil via `GET /api/backtest/status?jobId=X` setiap 3 detik
  - Tampilkan progress bar selama backtest berjalan

### 8.6 Halaman 4 — Portfolio & Performance

> **Reference:** Stitch Screen ID `da41b9f28d074bb58d10aa0e5edf49e5`

- [ ] **[F8-23]** Buat `src/web/src/pages/portfolio.ts`
  - **Widget: Equity Curve** — chart performa sepanjang waktu, overlay dengan benchmark BTC
  - **Widget: Performance Stats** — Sharpe ratio, Sortino, Max Drawdown, Calmar ratio
  - **Widget: Trade History Table** — semua closed trades, filterable by symbol/date/profit
  - **Widget: Monthly Returns Heatmap** — tabel bulan × tahun dengan warna green/red

- [ ] **[F8-24]** Implementasi export data
  - **[Export CSV]** — download trade history sebagai CSV
  - **[Export PDF]** — print-friendly performance report (browser print API)

### 8.7 Integrasi & Deployment

- [ ] **[F8-25]** Update `src/webServer.ts` — serve static files dari `dist/web/`
  ```ts
  app.use('/dashboard', express.static(path.join(__dirname, '../dist/web')))
  app.get('/dashboard/*', (req, res) => res.sendFile(path.join(__dirname, '../dist/web/index.html')))
  ```

- [ ] **[F8-26]** Tambah npm script di `package.json`:
  - `"build:web": "cd src/web && vite build --outDir ../../dist/web"`
  - `"dev:web": "cd src/web && vite --port 3001"`
  - `"build:all": "npm run build && npm run build:web"`

- [ ] **[F8-27]** Update `ecosystem.config.js` (dari Fase 6)
  - Tambah env var `WEB_DASHBOARD_URL` untuk link di Telegram bot
  - Bot kirim link dashboard di welcome message dan `/help` command

- [ ] **[F8-28]** Tambah command `/dashboard` di `enhancedBot.ts`
  - Return: link ke web dashboard dengan JWT token yang sudah di-embed (one-click login)
  - Format: `https://your-domain.com/dashboard#token=<jwt>`

### 📋 Ringkasan FASE 8

| Sprint | Fokus | Output |
|--------|-------|--------|
| S1 — Backend API | REST endpoints + WS proxy | `/api/*` routes siap |
| S2 — Frontend Setup | Vite + Design System + Routing | Shell dashboard berjalan |
| S3 — 4 Halaman | Implement semua widgets | 4 halaman sesuai Stitch design |
| S4 — Integrasi | Serve dari bot, auth, deployment | Dashboard live dari VPS |

---

## 🛡️ FASE 9 — Analysis Pipeline Hardening *(Baru: 2026-04-10)*

> **Estimasi:** 4–6 Hari
> **Prioritas:** 🔴 High — Berdasarkan bug nyata dari output bot produksi
> **Target Score:** Bonus +5 pts (125/100)
> **Trigger:** Analisis output bot `XRPUSDT` pada 2026-04-10 menemukan 6 gap kritis yang menurunkan kualitas sinyal secara diam-diam.

### 🔍 Temuan dari Output Bot (Root Cause Analysis)

Dari log output bot pada 2026-04-10:
```
[PublicCryptoService] Successfully fetched 56 candles for XRPUSDT   ← hanya 56 dari 100 yang diminta!
Generating chart for XRPUSDT - 1d | Patterns: 0, S/R: 0            ← timeframe 1d kosong!
Yahoo Finance failed, trying Alpha Vantage...                        ← fallback gagal 4x ulangan!
Alpha Vantage failed, trying Binance...                              ← provider chain tidak efisien!
[SCRAPE] [DONE] symbol=XRPUSDT rss=25 cryptopanic=0 reddit=0       ← reddit 0, cryptopanic 0!
[AI] [START] symbol=XRPUSDT articles=25 reddit=0                   ← AI dimulai tapi tidak ada [DONE]!
```

| # | Bug Teridentifikasi | Lokasi | Severity |
|---|---|---|---|
| B1 | Hanya 56/100 candles ter-fetch — kline 1d mungkin interval terlalu pendek di API | `publicCryptoService.ts` | 🔴 HIGH |
| B2 | Chart 1d menghasilkan 0 patterns & 0 S/R — data tidak cukup untuk deteksi | `imageChartService.ts` + `advancedAnalyzer.ts` | 🔴 HIGH |
| B3 | Yahoo Finance & Alpha Vantage gagal berulang — provider chain tidak ada caching | `simpleComprehensiveAnalyzer.ts` + `TradingViewService.ts` | 🟠 MEDIUM |
| B4 | Reddit = 0 saat produksi — kemungkinan rate-limited atau IP banned | `newsAnalyzer.ts` | 🟠 MEDIUM |
| B5 | `[AI] [START]` tapi tidak ada `[AI] [DONE]` dalam output — kemungkinan timeout tanpa error | `newsAnalyzer.ts` + `chutesService.ts` | 🔴 HIGH |
| B6 | Tidak ada response caching — setiap `/analyze` memanggil semua API ulang dari nol | Semua service | 🟡 LOW |

---

### 9.1 Fix: Candle Limit & Timeframe Data Quality

- [ ] **[F9-1]** Debug & fix kenapa hanya 56/100 candles ter-fetch untuk interval `4h`
  - File: `src/services/publicCryptoService.ts`
  - Investigasi: apakah parameter `limit` tidak dikirim dengan benar di query string
  - Fix: validasi bahwa `params.limit` terbaca di Axios request (log actual URL yang dikirim)
  - Tambah assertion: jika `response.data.length < limit * 0.8` → log warning dengan detail

- [ ] **[F9-2]** Implementasi minimum candle threshold per timeframe
  - File: `src/services/advancedAnalyzer.ts` → method `findSupportResistance()`
  - Jika candles < 30 → throw error deskriptif: `"Insufficient data: only X candles available, minimum 30 required"`
  - Caller (chart generator) warna abu-abu chart dengan watermark `"Insufficient Data"` alih-alih chart kosong

- [ ] **[F9-3]** Implementasi adaptive candle limit per timeframe di `getCandlestickData()`
  - File: `src/services/publicCryptoService.ts`
  - Tabel limit optimal: `1m`→500, `5m`→288, `15m`→192, `1h`→168, `4h`→100, `1d`→365
  - Jika interval tidak dikenali → gunakan limit yang diminta (default behavior)
  - Tambah validasi di method agar tidak exceed max Binance API limit (1000)

- [ ] **[F9-4]** Fix timeframe `1d` yang menghasilkan 0 deteksi pattern
  - File: `src/services/imageChartService.ts`
  - Root Cause: kemungkinan data 1d di-fetch dengan jumlah candle yang sama dengan `4h` (100 candle 1d = 100 hari, tapi pattern detection butuh minimal 60 candle)
  - Fix: tingkatkan default limit untuk fetch `1d` ke 200 candle
  - Pastikan S/R detection algorithm tidak gagal saat harga terlalu dekat antar candle

---

### 9.2 Fix: External Data Provider Fallback Chain

- [ ] **[F9-5]** Audit & perbaiki fallback chain Yahoo Finance → Alpha Vantage → Binance
  - File: `src/services/TradingViewService.ts` (atau file yang memanggilnya)
  - Masalah: retry terjadi 4x untuk 3 symbol berbeda — seharusnya per symbol hanya 1 pass, bukan retry loop pada seluruh pipeline
  - Fix: setiap provider harus wrap dalam `try/catch` terpisah dengan timeout eksplisit (≤ 5 detik)
  - Tambah log: `[Provider] ${providerName} failed in ${ms}ms: ${error.message}` agar diagnosis lebih cepat

- [ ] **[F9-6]** Tambah per-symbol provider caching (cache mana provider yang berhasil terakhir)
  - File: `src/services/TradingViewService.ts` atau buat `src/services/providerRouter.ts` baru
  - Simpan mapping `symbol → lastSuccessfulProvider` di memory (Map<string, string>)
  - Saat request baru masuk untuk symbol yang sama → coba provider terakhir yang berhasil PERTAMA
  - TTL cache: 30 menit (setelah itu reset ke urutan default lagi)
  - Manfaat: eliminasi 70-80% waktu retry yang terbuang

- [ ] **[F9-7]** Tambah circuit breaker per provider eksternal
  - Buat `src/services/providerCircuitBreaker.ts`
  - State machine: `CLOSED` → `OPEN` (setelah 3 fail berturut) → `HALF_OPEN` (setelah 5 menit)
  - Jika provider dalam state `OPEN` → skip langsung, jangan buang waktu dengan request
  - Tambah metric: total failures, last failure time, circuit state ke output `/healthcheck`

- [ ] **[F9-8]** Ganti Yahoo Finance dengan Binance Public API sebagai provider PERTAMA
  - File: `src/services/TradingViewService.ts`
  - Urutan baru: `PublicCryptoService (Binance)` → `CoinGecko API` → `Yahoo Finance` → `Alpha Vantage`
  - Binance public API tidak butuh API key dan coverage crypto-nya sempurna
  - CoinGecko free tier: `https://api.coingecko.com/api/v3/coins/{id}/ohlc?vs_currency=usd&days=30`

---

### 9.3 Fix: Chutes AI Timeout & Error Visibility

- [ ] **[F9-9]** Fix `[AI] [START]` yang tidak menghasilkan `[AI] [DONE]` atau `[AI] [ERROR]`
  - File: `src/services/newsAnalyzer.ts` → method `analyzeComprehensiveNews()`
  - Masalah probable: timeout di `chutesService.analyzeRealNews()` tidak di-catch dengan benar
  - Fix: wrap call ke `chutesService` dalam `Promise.race([call, timeout(30000)])` eksplisit
  - Tambah try/catch yang **selalu** log salah satu dari:
    - `[AI] [DONE] symbol=X sentiment=Y`
    - `[AI] [TIMEOUT] symbol=X after 30s`
    - `[AI] [ERROR] symbol=X message=Z`
  - **Tidak boleh ada [AI] [START] tanpa pasangan [AI] [DONE/TIMEOUT/ERROR]**

- [ ] **[F9-10]** Tambah telemetry timing untuk setiap AI call
  - File: `src/services/newsAnalyzer.ts`
  - Log `[AI] [TIMING] symbol=X duration=Xms tokens_used=X` setelah setiap call berhasil
  - Ini membantu identifikasi apakah model lambat atau ada bottleneck jaringan
  - Simpan timing ke DB jika tabel `ErrorLog` tersedia

- [ ] **[F9-11]** Implementasi AI fallback saat Chutes timeout
  - File: `src/services/newsAnalyzer.ts`
  - Jika Chutes AI timeout/error → fallback ke **keyword-based sentiment** yang sudah ada
  - Tambah flag di result: `aiAnalysis.source: 'chutes'|'keyword_fallback'`
  - User di Telegram menerima tetap hasil analisis, bukan error kosong

---

### 9.4 Fix: In-Memory Response Cache

- [ ] **[F9-12]** Implementasi TTL cache untuk data market yang mahal di-fetch
  - Buat `src/services/marketDataCache.ts`
  - Gunakan simple `Map<string, { data: any; expiry: number }>` (tidak perlu Redis untuk tahap ini)
  - TTL defaults:
    - Candlestick data `1h/4h`: cache 5 menit
    - Candlestick data `1d`: cache 30 menit
    - Ticker 24hr: cache 1 menit
    - Recent trades: cache 30 detik
  - Method: `cache.get(key)` → return data jika belum expired, null jika expired
  - Method: `cache.set(key, data, ttlMs)` → simpan ke map

- [ ] **[F9-13]** Integrasikan `marketDataCache` ke `PublicCryptoService`
  - File: `src/services/publicCryptoService.ts`
  - Sebelum fetch → cek cache. Jika hit: return cached data + log `[Cache HIT]`
  - Setelah fetch sukses → simpan ke cache + log `[Cache SET]`
  - Kalkulasi hit rate per session: tampilkan di `/healthcheck` sebagai `cache_hit_rate: X%`

- [ ] **[F9-14]** Integrasikan cache ke `advancedAnalyzer.ts`
  - Semua call ke `getCandlestickData()` dan `get24hrTicker()` harus melalui cache
  - Hindari redundant fetch untuk symbol yang sama dalam satu analisis run

- [ ] **[F9-15]** Tambah cache invalidation endpoint (untuk testing dan debug)
  - Command Telegram: `/clearcache [symbol?]` — admin only
  - Jika symbol disertakan → invalidate hanya cache untuk symbol tersebut
  - Jika tidak disertakan → flush semua cache
  - Response: `Cache cleared: X entries removed`

---

### 9.5 Observability & Logging Improvements

- [ ] **[F9-16]** Strukturkan log `/analyze` dengan prefix yang konsisten
  - Saat ini: beberapa log memakai `[AdvancedAnalyzer]`, beberapa `[PublicCryptoService]`, dll.
  - Standard baru: `[SVC:NamaService] [ACTION] detail`
  - Contoh: `[SVC:PublicCrypto] [FETCH] XRPUSDT klines 4h limit=100 → 56 candles in 320ms`
  - Log wajib include: symbol, action, result count, latency ms

- [ ] **[F9-17]** Tambah summary log di akhir setiap analisis run
  - File: `src/services/simpleComprehensiveAnalyzer.ts`
  - Format:
    ```
    [ANALYZE:DONE] symbol=XRPUSDT total_time=4521ms
      candles_1h=168 candles_4h=100 candles_1d=200
      sr_supports=3 sr_resistances=5
      news_articles=25 reddit=0
      ai=done|timeout|skip cache_hits=X/Y
    ```
  - Ini membuat diagnosis masalah jauh lebih mudah tanpa buka setiap log line

- [ ] **[F9-18]** Tambah timing breakdown per komponen di log
  - Ukur dan log waktu yang dihabiskan tiap bagian:
    - Fetch candles: `XXms`
    - S/R detection: `XXms`
    - Volume analysis: `XXms`
    - News fetch: `XXms`
    - AI analysis: `XXms`
    - Chart generation: `XXms`
  - Ini membantu identifikasi bottleneck yang paling memakan waktu

---

### 📋 Definisi "Done" Fase 9

- [ ] Output log `/analyze XRPUSDT` menampilkan jumlah candles ≥ 90% dari yang diminta
- [ ] Chart 1d tidak lagi menghasilkan "Patterns: 0, S/R: 0" untuk symbol major (BTC, ETH, XRP)
- [ ] Tidak ada lagi "Yahoo Finance failed, trying Alpha Vantage..." ulangan > 1x per symbol
- [ ] Setiap `[AI] [START]` selalu memiliki pasangan `[AI] [DONE]` atau `[AI] [ERROR]`
- [ ] Cache hit rate > 40% pada analisis kedua symbol yang sama dalam 5 menit
- [ ] Summary log muncul di akhir setiap `/analyze` dengan total_time dan breakdown

---

## 📰 FASE 10 — News Intelligence Upgrade *(Baru: 2026-04-10)*

> **Estimasi:** 5–7 Hari
> **Prioritas:** 🟡 Menengah — High impact pada kualitas sinyal fundamental
> **Target Score:** Bonus +5 pts (130/100)
> **Trigger:** Reddit = 0 dan CryptoPanic = 0 dalam output bot → 2 dari 3 data sumber gagal, kualitas analisis berita menurun drastis.

### 🔍 Temuan dari Output Bot (Root Cause Analysis)

```
[SCRAPE] [DONE] symbol=XRPUSDT rss=25 cryptopanic=0 reddit=0 totalArticles=25
```

- **RSS = 25** ✅ Ini angka kecil tapi berfungsi (hanya dari 4 sumber: CoinTelegraph, Decrypt, CryptoSlate, CoinDesk)
- **CryptoPanic = 0** ❌ `CRYPTOPANIC_API_KEY` tidak terkonfigurasi di `.env` → tidak pernah dicoba
- **Reddit = 0** ❌ Reddit API memblokir request dari bot (user-agent detected, rate limit, GDPR region)
- **Tidak ada sumber onchain/social lain** ❌ Tidak ada Twitter/X, Telegram channel, Fear & Greed Index

---

### 10.1 Perbaikan Reddit Data Collection

- [ ] **[F10-1]** Implementasi Reddit OAuth2 (user-less auth) sebagai pengganti scraping anonymous
  - File: `src/services/newsAnalyzer.ts` → method `fetchSubreddit()`
  - Daftar Reddit App di `https://www.reddit.com/prefs/apps` → pilih `script` type
  - Tambah ke `.env`: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`
  - Endpoint: `POST https://www.reddit.com/api/v1/access_token` untuk dapat bearer token
  - Token valid 1 jam → cache token, auto-refresh saat expired

- [ ] **[F10-2]** Update `fetchSubreddit()` untuk gunakan authenticated API
  - Request: `GET https://oauth.reddit.com/r/{subreddit}/search?q={coin}&sort=hot&limit=10&t=day`
  - Header: `Authorization: bearer {access_token}`, `User-Agent: {REDDIT_USER_AGENT}`
  - Rate limit: 60 request/menit untuk authenticated → jauh lebih aman dari anonymous (10 req/menit)

- [ ] **[F10-3]** Tambah subreddit baru yang relevan ke `COIN_SUBREDDITS`
  - File: `src/services/newsAnalyzer.ts`
  - Tambah: `LINK: 'Chainlink'`, `UNI: 'Uniswap'`, `ATOM: 'cosmosnetwork'`, `NEAR: 'NEARProtocol'`
  - Tambah universal fallback subreddits: `'algotrading'` (komunitas trading aktif)
  - Tambah check: jika coin tidak ada di mapping → gunakan keyword search di `r/CryptoCurrency`

- [ ] **[F10-4]** Implementasi Reddit sentiment scoring yang lebih canggih
  - File: `src/services/newsAnalyzer.ts` → method `scoreReddit()`
  - Sekarang: hanya title + score (upvote)
  - Update: tambah bobot `numComments` (viral discussion indicator)
  - Formula baru: `weight = log2(max(post.score, 1) + 1) * (1 + log2(max(post.numComments, 1) / 10))`
  - Tambah decay factor: post > 12 jam lalu → weight * 0.5 (berita lama kurang relevan)

---

### 10.2 Tambah Sumber Berita Baru

- [ ] **[F10-5]** Tambah CryptoPanic ke pipeline secara aktif
  - File: `src/services/newsAnalyzer.ts` → method `fetchCryptoPanic()`
  - Masalah: saat ini `if (!this.cryptoPanicKey) return []` → tidak ada warning
  - Fix: tambah log `[SCRAPE] [CRYPTOPANIC] No API key configured, skipping`
  - Pastikan `CRYPTOPANIC_API_KEY` terdokumentasi di `.env.example` dengan link signup
  - Signup free tier: `https://cryptopanic.com/api/` — 50 posts/hari gratis

- [ ] **[F10-6]** Tambah sumber RSS baru yang lebih spesifik crypto
  - File: `src/services/newsAnalyzer.ts` → `RSS_SOURCES` array
  - Tambahkan:
    ```
    { url: 'https://bitcoinmagazine.com/.rss/full/',          name: 'BitcoinMagazine' }
    { url: 'https://thedefiant.io/feed',                      name: 'TheDefiant'      }
    { url: 'https://blockworks.co/feed',                      name: 'Blockworks'      }
    { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', name: 'CoinDesk'        } // sudah ada, pastikan tidak duplikat
    { url: 'https://ambcrypto.com/feed/',                     name: 'AMBCrypto'       }
    ```
  - Update filter agar artikel relevan tanpa kata kunci "bitcoin" jika sedang analisis altcoin lain

- [ ] **[F10-7]** Integrasi Fear & Greed Index sebagai sinyal macro
  - API: `https://api.alternative.me/fng/?limit=7` (FREE, tidak perlu API key)
  - Return: nilai 0–100 (0=Extreme Fear, 100=Extreme Greed) + label
  - Tambah ke `NewsAnalysisResult` interface: `fearGreedIndex: { value: number, label: string, trend: 'improving'|'worsening'|'stable' }`
  - Tampilkan di output `/analyze`: `📊 Fear & Greed Index: 72 (Greed) ↑ improving`

- [ ] **[F10-8]** Integrasi Coindar untuk upcoming crypto events/catalysts
  - API: `https://coindar.org/api/v2/events?access_token={TOKEN}&filter_coins={COIN}&filter_date_start={today}`
  - Register free: `https://coindar.org/`
  - Tambah ke `.env.example`: `COINDAR_API_KEY`
  - Return: upcoming events dalam 7 hari (listing, halving, conference, partnership, etc.)
  - Tambah ke `NewsAnalysisResult`: `upcomingEvents: Array<{ title, date, importance: 1-5 }>`
  - Ini adalah **catalyst detector** — event besar bisa trigger breakout sebelum harga bergerak

---

### 10.3 Sentiment Scoring yang Lebih Akurat

- [ ] **[F10-9]** Ganti keyword matching dengan **rule-based NLP** yang lebih akurat
  - File: `src/services/newsAnalyzer.ts` → method `scoreTexts()`
  - Masalah saat ini: kata "down" dalam "doubled down" diberi skor negatif (false negative)
  - Fix: tambah **negation handling** — jika kata positif/negatif didahului negasi (`not`, `no`, `never`, etc.) → balik skor
  - Tambah **context windows**: jika `fail` muncul tapi diikuti `to fail again` → neutral
  - Tambah **intensity modifiers**: `massive rally` > `rally` (bobot 1.5x untuk modifier kata: massive, huge, major, significant)

- [ ] **[F10-10]** Implementasi **domain-specific crypto sentiment lexicon**
  - File baru: `src/data/cryptoSentimentLexicon.json`
  - Buat lexicon dengan skor +/- untuk kata-kata spesifik crypto:
    - Positif: `"etf approval": +5`, `"institutional buy": +3`, `"mainnet launch": +2`, `"partnership": +1.5`
    - Negatif: `"sec lawsuit": -5`, `"exchange hack": -4`, `"rug pull": -5`, `"regulatory ban": -4`
    - Neutral (override): `"correction normal", "dip buying"` → tidak dihitung negatif
  - Buat `CryptoLexiconScorer` class yang lookup tabel ini sebelum keyword matching biasa

- [ ] **[F10-11]** Implementasi article deduplication yang lebih cerdas
  - File: `src/services/newsAnalyzer.ts`
  - Masalah saat ini: tidak ada dedup antar RSS sources → artikel yang sama dari CoinDesk bisa muncul di CryptoSlate juga
  - Fix: implementasi **fuzzy title matching** — jika `similarity(title1, title2) > 80%` → buang satu
  - Library: `npm install string-similarity` (lightweight, no dependency)
  - Ambil artikel dengan sumber lebih otoritatif jika duplikat terdeteksi

- [ ] **[F10-12]** Tambah sentiment weighting berdasarkan source authority
  - File: `src/services/newsAnalyzer.ts`
  - Buat ranking authority: `CoinDesk > BitcoinMagazine > CoinTelegraph > AMBCrypto > others`
  - Artikel dari sumber authority tinggi → sentiment score * 1.5x weight
  - Tambah field `authorityWeight` ke `NewsItem` interface

---

### 10.4 Telegram Output Improvement untuk News

- [ ] **[F10-13]** Perbaiki format output berita di Telegram
  - File: `src/services/newsAnalyzer.ts` → method `formatBasicAnalysis()`
  - Sekarang: daftar headline biasa tanpa ranking relevansi
  - Update: sorting artikel berdasarkan relevance score (kombinasi: recency + sentiment intensity + source authority)
  - Tampilkan **top 3 artikel** dengan format:
    ```
    📈 [CoinDesk] XRP Breaks $2.50 Resistance: Bullish Momentum Confirmed
       ⏰ 2 jam lalu | 🎯 Relevance: 94% | Sentiment: 🟢 Bullish
    ```

- [ ] **[F10-14]** Tambah "Event Alert" ke output analisis
  - Jika ada upcoming event dalam 24 jam (dari Coindar) → tambah section khusus:
    ```
    ⚡ UPCOMING CATALYST (< 24h):
    • XRP: [5/5 importance] "Ripple v. SEC Settlement Hearing" — in 8 hours
    ⚠️ High volatility expected around this event
    ```

- [ ] **[F10-15]** Tambah `/news <symbol>` command yang dedicated
  - File: `src/enhancedBot.ts`
  - Berbeda dari `/analyze` yang comprehensive, `/news XRPUSDT` fokus hanya pada:
    1. Top 5 artikel terbaru + click-able links
    2. Reddit top discussions (jika ada)
    3. Fear & Greed Index saat ini
    4. Upcoming events dalam 7 hari
    5. Combined sentiment score + label
  - Jauh lebih cepat dari `/analyze` penuh (tidak generate chart, tidak run ML)
  - Execution target: < 5 detik

---

### 10.5 Persistensi & Monitoring News Data

- [ ] **[F10-16]** Buat tabel `NewsArticle` di Prisma schema
  - File: `prisma/schema.prisma`
  - Fields: `id, symbol, title, url, source, publishedAt, sentimentScore, authorityWeight, fetchedAt`
  - Index: `(symbol, publishedAt)` untuk query efisien
  - Simpan artikel yang di-fetch agar bisa di-backtest kualitas sentiment signal

- [ ] **[F10-17]** Implementasi historical sentiment scoring
  - Setelah N hari, kita bisa compare: "saat sentiment = very positive, apa yang terjadi pada harga?"
  - Buat method `evaluateSentimentAccuracy(lookbackDays: number)` di `NewsAnalyzer`
  - Bandingkan `sentimentScore` dengan `priceChange24h` pada hari yang sama
  - Tampilkan di `/mlstats`: `"News Sentiment Signal Accuracy (last 30d): 67%"`

- [ ] **[F10-18]** Tambah news data ke feature engineering untuk ML model
  - File: `src/services/featureEngineering.ts`
  - Tambah feature baru (3 features):
    - `sentimentScore` — nilai -1 hingga +1 dari combined news+reddit
    - `fearGreedIndex` — nilai 0–100 dinormalisasi ke 0–1
    - `hasUpcomingCatalyst` — binary 0/1 (ada event besar dalam 24 jam?)
  - Update `featureCount` di `SimpleGRUModel` sesuai penambahan
  - Ini berpotensi meningkatkan akurasi ML karena incorporates fundamental data

---

### 📋 Definisi "Done" Fase 10

- [ ] `[SCRAPE] [DONE] reddit=X` menampilkan X > 0 untuk semua symbol major
- [ ] Fear & Greed Index muncul di output `/analyze` dan diperbarui setiap request
- [ ] RSS berhasil fetch dari minimal 6 sumber (saat ini 4)
- [ ] Deduplication berjalan: tidak ada artikel yang sama muncul dari 2 sumber berbeda
- [ ] `/news XRPUSDT` berfungsi dan selesai dalam < 5 detik
- [ ] Setidaknya 1 historical sentiment record tersimpan per analisis di DB

---

## 📝 APPENDIX A — File Baru yang Perlu Dibuat


| File | Fase | Deskripsi |
|------|------|-----------|
| `src/services/binanceOrderService.ts` | F1 | Eksekusi order ke Binance API |
| `src/services/realTradingEngine.ts` | F1 | Orkestrasi live trading |
| `src/services/riskMonitorLoop.ts` | F1 | Background loop monitoring SL/TP |
| `src/services/binanceWebSocketService.ts` | F3 | WebSocket streams management |
| `src/services/connectionManager.ts` | F3 | Manajemen semua koneksi aktif |
| `src/services/bayesianOptimizer.ts` | F5 | Bayesian optimization (TPE) |
| `src/services/rateLimiter.ts` | F6 | Token bucket rate limiter |
| `src/services/healthMonitor.ts` | F6 | Health monitoring & alerting |
| `src/utils/logger.ts` | F6 | Structured logger wrapper |
| `scripts/test-order-service.ts` | F1 | Test order execution di Testnet |
| `scripts/migrate-sqlite-to-postgres.ts` | F6 | Script migrasi database |
| `ecosystem.config.js` | F6 | PM2 process config |
| `Dockerfile` | F6 | Docker containerization |
| `tests/binanceOrderService.test.ts` | F6 | Unit test order service |
| `tests/riskMonitorLoop.test.ts` | F6 | Unit test risk monitor |
| `tests/featureEngineering.test.ts` | F6 | Unit test feature engineering |
| `tests/backtestEngine.test.ts` | F6 | Unit test backtest engine |
| `src/services/ai/llmClient.ts` | F7 | Wrapper adapter untuk Chutes AI |
| `src/services/ai/promptTemplates.ts` | F7 | Template prompt seluruh LLM agent |
| `src/services/ai/agentContext.ts` | F7 | Interface dan tipe data antar agent |
| `src/services/ai/analysts/technicalAnalystAgent.ts` | F7 | Agent: Technical Analysis LLM |
| `src/services/ai/analysts/sentimentAnalystAgent.ts` | F7 | Agent: Sentiment Analysis LLM |
| `src/services/ai/analysts/newsAnalystAgent.ts` | F7 | Agent: News Impact LLM |
| `src/services/ai/analysts/mlInterpretationAgent.ts` | F7 | Agent: Interpretasi output ML |
| `src/services/ai/researchers/bullishResearcherAgent.ts` | F7 | Agent: Argumen Bullish |
| `src/services/ai/researchers/bearishResearcherAgent.ts` | F7 | Agent: Argumen Bearish |
| `src/services/ai/researchers/debateOrchestrator.ts` | F7 | Orkestrasi debat antar peneliti |
| `src/services/ai/traderAgent.ts` | F7 | Agent: konversi debat jadi proposal trade |
| `src/services/ai/portfolioManagerAgent.ts` | F7 | Agent: approve/reject proposal |
| `src/services/ai/multiAgentOrchestrator.ts` | F7 | Entry point seluruh pipeline multi-agent |
| `src/web/` | F8 | Direktori root Vite frontend project |
| `src/web/src/styles/design-system.css` | F8 | Implementasi Stitch design tokens ke CSS |
| `src/web/src/api/apiClient.ts` | F8 | HTTP client wrapper dengan auto JWT auth |
| `src/web/src/api/wsClient.ts` | F8 | WebSocket client dengan auto-reconnect |
| `src/web/src/pages/dashboard.ts` | F8 | Halaman Main Trading Dashboard |
| `src/web/src/pages/aiAnalysis.ts` | F8 | Halaman AI Analysis & Sentiment |
| `src/web/src/pages/backtesting.ts` | F8 | Halaman Backtesting & Strategy Lab |
| `src/web/src/pages/portfolio.ts` | F8 | Halaman Portfolio & Performance |
| `src/services/marketDataCache.ts` | F9 | TTL in-memory cache untuk data market |
| `src/services/providerCircuitBreaker.ts` | F9 | Circuit breaker per data provider eksternal |
| `src/services/providerRouter.ts` | F9 | Smart routing & per-symbol provider caching |
| `src/data/cryptoSentimentLexicon.json` | F10 | Domain-specific crypto sentiment lexicon |

---

## 📝 APPENDIX B — File yang Perlu Dimodifikasi

| File | Fase | Perubahan |
|------|------|-----------|
| `package.json` | F0 | Pindah `@prisma/client` ke dependencies, hapus node-binance-api atau gunakan, downgrade express |
| `prisma/schema.prisma` | F0 | Tambah `url = env("DATABASE_URL")` |
| `.env` | F0 | Tambah `DATABASE_URL`, `BINANCE_TESTNET`, variabel baru |
| `src/services/signalGenerator.ts` | F0 | Return structured signal object |
| `src/services/paperTradingEngine.ts` | F2 | Slippage, spread, liquidity, persist state |
| `src/services/riskMonitorLoop.ts` | F3 | Ganti polling ke WebSocket |
| `src/ml/simpleGRUModel.ts` | F4 | Arsitektur baru, WFV, softmax output |
| `src/services/featureEngineering.ts` | F4 | Tambah fitur 15m dan 4h |
| `src/services/strategyOptimizer.ts` | F5 | Tambah WFO, integrasikan Bayesian optimizer |
| `src/services/databaseService.ts` | F6 | Update untuk PostgreSQL compatibility |
| `src/enhancedBot.ts` | F1,F3 | Tambah commands baru (livetrade, orders, subscribe) |
| `src/webServer.ts` | F6, F8 | Tambah `/health` endpoint + serve Vite build + `/api/*` router |
| `scripts/production-training.ts` | F4 | Proper train/val/test split, WFV |
| `src/services/signalGenerator.ts` | F7 | Integrasi output multi-agent sebagai sinyal utama |
| `src/enhancedBot.ts` | F7, F8 | Tambah command `/agentanalysis`, `/agentlog`, `/dashboard` |
| `prisma/schema.prisma` | F7 | Tambah tabel `AgentAnalysisLog` |
| `package.json` | F8 | Tambah script `build:web`, `dev:web`, `build:all` |
| `ecosystem.config.js` | F8 | Tambah env var `WEB_DASHBOARD_URL` |
| `src/services/publicCryptoService.ts` | F9 | Fix candle limit, adaptive limit per timeframe, cache integration |
| `src/services/advancedAnalyzer.ts` | F9 | Minimum candle threshold, fix 1d pattern detection |
| `src/services/imageChartService.ts` | F9 | Tingkatkan limit 1d ke 200, handle insufficient data gracefully |
| `src/services/TradingViewService.ts` | F9 | Fix provider fallback chain, tambah circuit breaker, ganti urutan priority |
| `src/services/simpleComprehensiveAnalyzer.ts` | F9 | Summary log, timing breakdown, integrate marketDataCache |
| `src/services/newsAnalyzer.ts` | F9,F10 | Fix AI timeout log, Reddit OAuth2, tambah sumber RSS, sentiment lexicon |
| `src/services/chutesService.ts` | F9 | Tambah Promise.race timeout wrapper, log [DONE]/[ERROR] konsisten |
| `src/services/featureEngineering.ts` | F10 | Tambah 3 features baru: sentimentScore, fearGreedIndex, hasUpcomingCatalyst |
| `src/ml/simpleGRUModel.ts` | F10 | Update featureCount sesuai penambahan dari F10-18 |
| `prisma/schema.prisma` | F10 | Tambah tabel `NewsArticle` |
| `src/enhancedBot.ts` | F10 | Tambah command `/news <symbol>`, `/clearcache` |

---

## 📝 APPENDIX C — Environment Variables yang Dibutuhkan

```env
# Database
DATABASE_URL="file:./prisma/dev.db"              # Development (SQLite)
# DATABASE_URL="postgresql://..."                 # Production (PostgreSQL)

# Telegram
TELEGRAM_BOT_TOKEN=your_token_here
TELEGRAM_ADMIN_ID=your_telegram_user_id          # BARU - untuk health alerts

# Binance Mainnet
BINANCE_API_KEY=your_api_key
BINANCE_API_SECRET=your_api_secret

# Binance Testnet (untuk development)            # BARU
BINANCE_TESTNET=true
BINANCE_TESTNET_API_KEY=your_testnet_key
BINANCE_TESTNET_API_SECRET=your_testnet_secret
BINANCE_TESTNET_URL=https://testnet.binance.vision

# ML & AI
CHUTES_API_KEY=your_chutes_key

# Risk Management                                 # BARU
MAX_ACCOUNT_DRAWDOWN=0.15                        # 15% max drawdown sebelum circuit breaker
MAX_OPEN_TRADES=3
DEFAULT_RISK_PER_TRADE=0.01                      # 1% risk per trade

# Multi-Agent LLM (Fase 7)                        # BARU
USE_MULTI_AGENT=false                            # Toggle fitur multi-agent (true|false)
CHUTES_MODEL_DEEP=Qwen/Qwen3-235B-A22B          # Model untuk reasoning berat
CHUTES_MODEL_QUICK=Qwen/Qwen3-30B-A3B           # Model untuk tugas cepat
MAX_DEBATE_ROUNDS=1                              # Jumlah putaran debat LLM
AGENT_TIMEOUT_MS=30000                           # Timeout per LLM call

# News Intelligence (Fase 10)                     # BARU
REDDIT_CLIENT_ID=your_reddit_client_id           # OAuth2 Reddit App Client ID
REDDIT_CLIENT_SECRET=your_reddit_client_secret   # OAuth2 Reddit App Client Secret
REDDIT_USER_AGENT=RabTradebot/1.0 (by /u/your_username)  # Reddit API User-Agent
CRYPTOPANIC_API_KEY=your_cryptopanic_key         # Free: cryptopanic.com/api/
COINDAR_API_KEY=your_coindar_key                 # Free: coindar.org (catalyst events)

# Analysis Pipeline (Fase 9)                      # BARU
MARKET_DATA_CACHE_ENABLED=true                   # Toggle in-memory cache
CANDLE_CACHE_TTL_MIN=5                           # Cache TTL untuk 1h/4h candles (menit)
CANDLE_CACHE_TTL_DAILY=30                        # Cache TTL untuk 1d candles (menit)
PROVIDER_CIRCUIT_BREAKER_THRESHOLD=3             # Failures sebelum circuit open
PROVIDER_CIRCUIT_RESET_MS=300000                 # 5 menit reset circuit breaker
AI_ANALYSIS_TIMEOUT_MS=30000                     # Timeout Chutes AI call (ms)

# Logging
LOG_LEVEL=info                                   # debug | info | warn | error
NODE_ENV=production
```

---

## 📝 APPENDIX D — Urutan Dependency Antar Fase

```
Fase 0 (Bug Fixes)
    │
    ▼
Fase 1 (Order Execution) ◄─── DEPENDENCY UTAMA
    │
    ├──► Fase 2 (Paper Trading Realistis)
    │        │
    │        └──► Independen, bisa paralel dengan Fase 3
    │
    └──► Fase 3 (WebSocket)
             │
             └──► Menggantikan polling di Fase 1

Fase 4 (ML Pipeline) ◄─── Bisa dikerjakan paralel dengan Fase 2 & 3
    │
    ▼
Fase 5 (Strategy Optimizer) ◄─── Butuh Fase 4 selesai dulu

Fase 6 (Infrastructure) ◄─── Bisa dimulai kapan saja, tapi idealnya setelah Fase 1-5

Fase 7 (Multi-Agent LLM) ◄─── Bisa dikerjakan PARALEL sejak Fase 3 selesai
    │
    └──► Integrasi ke signalGenerator.ts (bergantung Fase 1 & 2 selesai ✅)

Fase 8 (Web Dashboard) ◄─── Bisa dikerjakan PARALEL sejak Fase 3 selesai
    │
    ├──► Sprint 1 (Backend API) — bergantung Fase 1 selesai ✅ (trade data di DB)
    ├──► Sprint 3 (AI Analysis page) — opsional bergantung Fase 7 untuk full feature
    └──► Sprint 4 (Deployment) — idealnya setelah Fase 6 (VPS + PM2 tersedia)
```

---

## 🏁 Definition of Done per Fase

### Fase 0 ✅ Done jika:
- [ ] `npm run build` tidak ada error
- [ ] `npx prisma migrate dev` berjalan tanpa error
- [ ] Bot bisa start dan semua command lama masih berfungsi

### Fase 1 ✅ Done jika:
- [ ] Bisa place MARKET order di Binance Testnet dari command `/livetrade start`
- [ ] Risk monitor loop berjalan dan terbukti menutup posisi saat SL terpicu (di Testnet)
- [ ] Semua order ter-log di database dan konfirmasi tampil di Telegram

### Fase 2 ✅ Done jika:
- [ ] Paper trading hasil dengan slippage terlihat lebih rendah dari tanpa slippage
- [ ] State paper trading tidak hilang setelah bot restart
- [ ] Equity curve chart tampil di `/performance`

### Fase 3 ✅ Done jika:
- [ ] Harga update < 1 detik di internal sistem (diverifikasi dengan logging timestamp)
- [ ] Auto-reconnect terbukti berfungsi saat koneksi diputus manual
- [ ] Sinyal otomatis dikirim ke Telegram saat kline 1h close dengan kondisi entry

### Fase 4 ✅ Done jika:
- [ ] Walk-forward validation menghasilkan akurasi konsisten > 55% (rata-rata semua window)
- [ ] Confidence 70%+ terbukti lebih akurat dari confidence 50% (via calibration test)
- [ ] Training selesai dalam waktu yang wajar (< 30 menit untuk 2 tahun data)

### Fase 5 ✅ Done jika:
- [ ] WFO menghasilkan parameter yang performanya di out-of-sample tidak lebih buruk dari 20% vs in-sample
- [ ] Bayesian optimizer menemukan parameter yang sama baiknya dengan grid search dalam 1/5 jumlah evaluasi
- [ ] Monte Carlo test menunjukkan strategi positif dalam > 80% simulasi

### Fase 7 ✅ Done jika:
- [ ] `multiAgentOrchestrator.runAnalysis()` berhasil menghasilkan keputusan BUY/SELL/HOLD dalam < 60 detik
- [ ] Keempat analyst agent berjalan paralel dan hasilnya terkumpul sebelum debat dimulai
- [ ] Command `/agentanalysis BTCUSDT` berfungsi dari Telegram dan menampilkan ringkasan semua agent
- [ ] Toggle `USE_MULTI_AGENT=false` memastikan fallback ke GRU + TA rule-based berjalan normal
- [ ] Akurasi agent tercatat dan bisa dilihat di `/mlstats` setelah minimal 20 analisis

### Fase 8 ✅ Done jika:
- [ ] Dashboard dapat diakses via browser di `https://your-domain.com/dashboard` dari VPS
- [ ] Live price ticker update < 1 detik via WebSocket di halaman Main Dashboard
- [ ] Semua 4 halaman (Dashboard, AI Analysis, Backtesting, Portfolio) ter-render sesuai Stitch design
- [ ] JWT auth berfungsi — link dari Telegram `/dashboard` langsung login tanpa password manual
- [ ] Export CSV trade history berhasil didownload dari halaman Portfolio

### Fase 6 ✅ Done jika:
- [x] Bot berjalan stabil di VPS selama 72 jam tanpa restart manual
- [x] Coverage test mencapai minimal 80%
- [x] Health endpoint `/health` mengembalikan status yang akurat
- [x] Admin menerima alert Telegram saat bot sengaja di-crash untuk testing

---

## 📊 Scorecard Final

| Komponen | Sebelum | Sesudah |
|----------|---------|---------|
| Technical Indicators | 9/10 | 9/10 |
| Feature Engineering | 8/10 | 9/10 |
| ML Model | 3/10 | 8/10 |
| Backtest Engine | 7/10 | 8/10 |
| Strategy Optimizer | 5/10 | 9/10 |
| Risk Management | 3/10 | 9/10 |
| Order Execution | 0/10 | 9/10 |
| Paper Trading | 4/10 | 9/10 |
| Real-time Data | 4/10 | 9/10 |
| Database & Logging | 7/10 | 9/10 |
| Testing & Coverage | 2/10 | 8/10 |
| Infrastructure | 2/10 | 9/10 |
| Multi-Agent LLM | 0/10 | 9/10 |
| Web Dashboard | 0/10 | 9/10 |
| **Analysis Pipeline Reliability** *(F9 — Baru)* | 3/10 | 9/10 |
| **News Intelligence Quality** *(F10 — Baru)* | 2/10 | 9/10 |
| **TOTAL** | **54/160** | **143/160** ≈ **130/100** (Elite Tier) |

---

*Dokumen ini adalah living document — update status setiap task saat selesai dikerjakan.*
*Legend: ⏳ Pending | 🔄 In Progress | ✅ Done | ❌ Cancelled | ⏸️ Blocked*
*Fase 9 & 10 ditambahkan pada 2026-04-10 berdasarkan analisis output bot real XRPUSDT — 6 bug kritis teridentifikasi.*

