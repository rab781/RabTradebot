# 🗺️ ROADMAP TODO — RabTradebot Quant Trading Bot

> **Target:** Dari 50/100 → 100/100 Full Quant Trading Bot  
> **Estimasi Total:** ~8 Minggu  
> **Last Updated:** 2025

---

## 📊 Progress Overview

| Fase | Nama | Status | Bobot | Progress |
|------|------|--------|-------|----------|
| 0 | Critical Bug Fixes | ⏳ Pending | +2 pts | 0% |
| 1 | Real Order Execution | ⏳ Pending | +20 pts | 0% |
| 2 | Realistic Paper Trading | ⏳ Pending | +8 pts | 0% |
| 3 | Real-time WebSocket | ⏳ Pending | +7 pts | 0% |
| 4 | ML Pipeline Improvement | ⏳ Pending | +8 pts | 0% |
| 5 | Strategy Optimization | ⏳ Pending | +4 pts | 0% |
| 6 | Production Infrastructure | ⏳ Pending | +3 pts | 0% |

**Scorecard Saat Ini: 50 / 100**

---

## ⚡ FASE 0 — Critical Bug Fixes

> **Estimasi:** 1 Hari  
> **Prioritas:** 🔴 WAJIB DIKERJAKAN PERTAMA  
> **Target Score:** 52 / 100

### Bugs Kritis

- [ ] **[F0-1]** Pindahkan `@prisma/client` dari `devDependencies` ke `dependencies` di `package.json`
  - File: `package.json`
  - Dampak: Bot akan crash di production karena Prisma client tidak tersedia

- [ ] **[F0-2]** Tambahkan `url = env("DATABASE_URL")` ke `datasource db` di Prisma schema
  - File: `prisma/schema.prisma`
  - Tambahkan baris: `url = env("DATABASE_URL")`

- [ ] **[F0-3]** Tambahkan `DATABASE_URL` ke file `.env`
  - File: `.env`
  - Isi: `DATABASE_URL="file:./prisma/dev.db"` (untuk development)

- [ ] **[F0-4]** Perbaiki `SignalGenerator` agar menghasilkan structured signal output
  - File: `src/services/signalGenerator.ts`
  - Saat ini: hanya output string narasi
  - Target: tambah return object `{ action: 'BUY'|'SELL'|'HOLD', price, stopLoss, takeProfit, confidence, reason }`

- [ ] **[F0-5]** Hapus atau gunakan dependency `node-binance-api` yang tidak terpakai
  - File: `package.json`
  - Pilihan: hapus dari dependencies, atau replace `node-binance-api` di `technicalAnalyzer.ts` secara konsisten

- [ ] **[F0-6]** Persist state paper trading ke database saat setiap perubahan
  - File: `src/services/paperTradingEngine.ts`
  - Semua open positions harus disimpan ke tabel `Trade` dengan status `PAPER_OPEN`
  - Baca kembali state dari DB saat class diinisialisasi ulang

- [ ] **[F0-7]** Downgrade `express` dari `^5.2.1` (beta) ke `^4.21.0` (stable)
  - File: `package.json`
  - Express 5 masih beta dan tidak production-ready

- [ ] **[F0-8]** Jalankan `prisma generate` setelah fix schema
  - Command: `npx prisma generate`
  - Command: `npx prisma migrate dev --name fix_datasource_url`

---

## 🔵 FASE 1 — Real Order Execution

> **Estimasi:** 1–2 Minggu  
> **Prioritas:** 🔴 Tertinggi — Core dari Quant Trading  
> **Target Score:** 70 / 100

### 1.1 BinanceOrderService (File Baru)

- [ ] **[F1-1]** Buat file `src/services/binanceOrderService.ts`

- [ ] **[F1-2]** Implementasi `placeMarketOrder(symbol, side, quantity)`
  - Endpoint: `POST /api/v3/order`
  - Parameter: `{ symbol, side, type: 'MARKET', quantity }`
  - Return: `{ orderId, status, executedQty, price }`

- [ ] **[F1-3]** Implementasi `placeLimitOrder(symbol, side, quantity, price)`
  - Endpoint: `POST /api/v3/order`
  - Parameter: `{ symbol, side, type: 'LIMIT', quantity, price, timeInForce: 'GTC' }`

- [ ] **[F1-4]** Implementasi `placeStopLossLimitOrder(symbol, side, quantity, stopPrice, limitPrice)`
  - Endpoint: `POST /api/v3/order`
  - Parameter: `{ type: 'STOP_LOSS_LIMIT', stopPrice, price, timeInForce: 'GTC' }`

- [ ] **[F1-5]** Implementasi `placeTakeProfitLimitOrder(symbol, side, quantity, stopPrice, limitPrice)`
  - Endpoint: `POST /api/v3/order`
  - Parameter: `{ type: 'TAKE_PROFIT_LIMIT' }`

- [ ] **[F1-6]** Implementasi `cancelOrder(symbol, orderId)`
  - Endpoint: `DELETE /api/v3/order`

- [ ] **[F1-7]** Implementasi `cancelAllOpenOrders(symbol)`
  - Endpoint: `DELETE /api/v3/openOrders`

- [ ] **[F1-8]** Implementasi `getOpenOrders(symbol?)`
  - Endpoint: `GET /api/v3/openOrders`

- [ ] **[F1-9]** Implementasi `getOrderStatus(symbol, orderId)`
  - Endpoint: `GET /api/v3/order`

- [ ] **[F1-10]** Implementasi `getCurrentPrice(symbol)`
  - Endpoint: `GET /api/v3/ticker/price`
  - Ini untuk polling cepat sebelum WebSocket tersedia (Fase 3)

- [ ] **[F1-11]** Implementasi `getAccountBalance()`
  - Endpoint: `GET /api/v3/account`
  - Return hanya non-zero balances

- [ ] **[F1-12]** Implementasi `getSymbolInfo(symbol)`
  - Endpoint: `GET /api/v3/exchangeInfo`
  - Return: `{ minQty, maxQty, stepSize, minNotional, tickSize }`
  - Dipakai untuk validasi order sebelum dikirim

- [ ] **[F1-13]** Implementasi `roundToStepSize(quantity, stepSize)` — helper function
  - Binance menolak order jika quantity tidak mengikuti `stepSize` exact
  - Contoh: stepSize=0.001, quantity=0.0015123 → 0.001

- [ ] **[F1-14]** Tambah rate limiter di `BinanceOrderService`
  - Max 1200 request/menit (weight-based)
  - Setiap request catat weight-nya berdasarkan tipe endpoint
  - Jika mendekati limit → auto throttle

- [ ] **[F1-15]** Tambah retry logic dengan exponential backoff
  - Retry 3x untuk error `429` (rate limit) dan `5xx` (server error)
  - Delay: 1s, 2s, 4s
  - Jangan retry untuk error `-2010` (insufficient balance) atau `-1121` (invalid symbol)

### 1.2 RealTradingEngine (File Baru)

- [ ] **[F1-16]** Buat file `src/services/realTradingEngine.ts`

- [ ] **[F1-17]** Implementasi `executeEntry(signal, riskParams)`
  - Hitung `quantity` berdasarkan `riskParams.riskPerTrade` dan `stopLoss` distance
  - Panggil `binanceOrderService.roundToStepSize()` sebelum kirim
  - Kirim market order via `binanceOrderService.placeMarketOrder()`
  - Simpan trade ke DB dengan `orderId` Binance
  - Kirim konfirmasi ke Telegram user

- [ ] **[F1-18]** Implementasi `executeExit(tradeId, reason)`
  - Fetch trade dari DB
  - Cancel semua pending orders terkait trade ini
  - Kirim market order sisi berlawanan
  - Update trade di DB: `exitPrice`, `exitTime`, `profit`, `status: CLOSED`
  - Kirim laporan profit/loss ke Telegram user

- [ ] **[F1-19]** Implementasi position sizing via Kelly Criterion
  - Formula: `f = (edge * odds - (1 - edge)) / odds`
  - Edge = win rate dari backtest terbaru
  - Batasi dengan `maxPositionSize` dari OpenClawConfig
  - Minimum position = `minPositionSize`

- [ ] **[F1-20]** Validasi sebelum eksekusi order
  - Cek saldo cukup (`getAccountBalance()`)
  - Cek jumlah open trades tidak melebihi `maxOpenTrades`
  - Cek simbol valid (`getSymbolInfo()`)
  - Cek minimum notional (`quantity * price >= minNotional`)

### 1.3 Risk Management Loop (File Baru)

- [ ] **[F1-21]** Buat file `src/services/riskMonitorLoop.ts`

- [ ] **[F1-22]** Implementasi main monitoring loop (polling REST, 5 detik interval)
  - Fetch semua open trades dari DB
  - Untuk setiap trade: fetch current price
  - Cek stop loss, take profit, trailing stop
  - Jika triggered → panggil `realTradingEngine.executeExit()`

- [ ] **[F1-23]** Implementasi trailing stop logic
  - Track `highestPrice` sejak entry untuk LONG, `lowestPrice` untuk SHORT
  - Hitung trailing stop berdasarkan `trailingStopPositive` dari strategy config
  - Update `stoplossRate` di DB setiap kali harga baru lebih menguntungkan

- [ ] **[F1-24]** Implementasi portfolio-level circuit breaker
  - Jika total account drawdown > threshold (default 15%) → stop semua trading otomatis
  - Kirim alert darurat ke Telegram admin
  - Semua open positions di-close dengan market order

- [ ] **[F1-25]** Tambah `riskMonitorLoop.start()` dan `stop()` di bot startup/shutdown

### 1.4 Integrasi ke Bot Telegram

- [ ] **[F1-26]** Tambah command `/livetrade start <symbol>` di `enhancedBot.ts`
  - Gunakan `OpenClawStrategy` sebagai default
  - Konfirmasi dari user sebelum mulai (karena uang nyata)
  - Tampilkan disclaimer risiko

- [ ] **[F1-27]** Tambah command `/livetrade stop` di `enhancedBot.ts`

- [ ] **[F1-28]** Tambah command `/liveportfolio` — lihat posisi live + unrealized PnL

- [ ] **[F1-29]** Tambah command `/orders` — lihat open orders di Binance real-time

- [ ] **[F1-30]** Tambah command `/cancelorder <orderId>` — cancel order spesifik

- [ ] **[F1-31]** Tambah notifikasi otomatis saat:
  - Order tereksekusi (entry/exit)
  - Stop loss terpicu
  - Take profit tercapai
  - Error eksekusi

### 1.5 Testing Fase 1

- [ ] **[F1-32]** Buat `scripts/test-order-service.ts` — test semua fungsi order dengan Testnet Binance
- [ ] **[F1-33]** Daftarkan akun di Binance Testnet: `https://testnet.binance.vision`
- [ ] **[F1-34]** Tambah `BINANCE_TESTNET=true` dan `BINANCE_TESTNET_URL` ke `.env`
- [ ] **[F1-35]** Test full flow: signal → entry order → risk monitor → exit order

---

## 🟡 FASE 2 — Paper Trading yang Realistis

> **Estimasi:** 3–5 Hari  
> **Prioritas:** 🟡 Menengah  
> **Target Score:** 78 / 100

### 2.1 Slippage Modeling

- [ ] **[F2-1]** Buat helper `calculateSlippage(price, side, quantity, avgVolume20)` di `paperTradingEngine.ts`
  - Volume impact: `(quantity / avgVolume20) * 0.001` (0.1% per 1x average volume)
  - Random component: `±0.05%` gaussian noise
  - Total: `slippage = volumeImpact + randomComponent`
  - BUY: `fillPrice = price * (1 + slippage)`
  - SELL: `fillPrice = price * (1 - slippage)`

- [ ] **[F2-2]** Integrasikan `calculateSlippage()` ke `createTrade()` dan `closeTrade()`

- [ ] **[F2-3]** Tambah `slippage` field ke `PaperTradingResult` dan tampilkan di `/performance`

### 2.2 Bid/Ask Spread Simulation

- [ ] **[F2-4]** Buat lookup table spread per kategori pair:
  - BTC/USDT: 0.01%
  - ETH/USDT, BNB/USDT: 0.015%
  - Large cap altcoin: 0.03%
  - Small cap altcoin: 0.1%

- [ ] **[F2-5]** Terapkan spread: BUY di ask price (+spread/2), SELL di bid price (-spread/2)

### 2.3 Liquidity Constraint

- [ ] **[F2-6]** Hitung `avgVolume20` dari candle data saat ini
- [ ] **[F2-7]** Jika `orderSize > avgVolume20 * 0.01` (1% dari avg volume) → partial fill atau reject
- [ ] **[F2-8]** Simulasi partial fill: fill maksimum 1% avg volume, sisanya pending

### 2.4 Persist State ke Database

- [ ] **[F2-9]** Simpan setiap open paper trade ke tabel `Trade` dengan field `notes: "PAPER_TRADE"`
- [ ] **[F2-10]** Baca kembali open paper trades dari DB saat `PaperTradingEngine.start()` dipanggil
- [ ] **[F2-11]** Update DB setiap kali posisi berubah (trailing stop update, unrealized PnL)
- [ ] **[F2-12]** Simpan `performanceHistory` ke DB berkala (setiap 10 iterasi)

### 2.5 Peningkatan Reporting

- [ ] **[F2-13]** Tambah kolom `slippageCost` dan `spreadCost` di laporan paper trading
- [ ] **[F2-14]** Tambah equity curve chart di command `/performance` (gunakan `imageChartService`)
- [ ] **[F2-15]** Tambah perbandingan "dengan slippage" vs "tanpa slippage" di hasil akhir

---

## 🟠 FASE 3 — Real-time Data dengan WebSocket

> **Estimasi:** 3–5 Hari  
> **Prioritas:** 🟡 Menengah  
> **Target Score:** 85 / 100

### 3.1 BinanceWebSocketService (File Baru)

- [ ] **[F3-1]** Install dependency: `npm install ws @types/ws`

- [ ] **[F3-2]** Buat file `src/services/binanceWebSocketService.ts`

- [ ] **[F3-3]** Implementasi `subscribeTickerStream(symbol, callback)`
  - URL: `wss://stream.binance.com:9443/ws/<symbol>@ticker`
  - Callback dipanggil setiap update harga (< 1 detik)
  - Data: `{ symbol, lastPrice, bidPrice, askPrice, volume, priceChangePercent }`

- [ ] **[F3-4]** Implementasi `subscribeKlineStream(symbol, interval, callback)`
  - URL: `wss://stream.binance.com:9443/ws/<symbol>@kline_<interval>`
  - Callback dipanggil setiap candle update
  - Saat `kline.isClosed === true` → trigger strategy evaluation

- [ ] **[F3-5]** Implementasi `subscribeUserDataStream(listenKey, callbacks)`
  - URL: `wss://stream.binance.com:9443/ws/<listenKey>`
  - Handles: `outboundAccountPosition` (balance update), `executionReport` (order update)
  - Penting untuk mengetahui kapan order di-fill tanpa polling

- [ ] **[F3-6]** Implementasi `getListenKey()` — request listen key dari `POST /api/v3/userDataStream`

- [ ] **[F3-7]** Implementasi `keepAliveListenKey()` — ping setiap 30 menit agar listen key tidak expired

- [ ] **[F3-8]** Implementasi auto-reconnect WebSocket
  - Jika koneksi putus → tunggu 1s → reconnect
  - Jika gagal 5x berturut-turut → kirim alert ke Telegram admin
  - Max reconnect delay: 30 detik (exponential backoff)

- [ ] **[F3-9]** Implementasi `unsubscribe(symbol)` dan `unsubscribeAll()`

### 3.2 Integrasi WebSocket ke Risk Monitor

- [ ] **[F3-10]** Update `riskMonitorLoop.ts` — ganti polling REST 5 detik ke WebSocket ticker callback
- [ ] **[F3-11]** Harga update real-time dari WebSocket langsung trigger pengecekan SL/TP
- [ ] **[F3-12]** Gunakan `executionReport` dari User Data Stream untuk konfirmasi fill otomatis

### 3.3 Auto-Signal dari Kline Close

- [ ] **[F3-13]** Saat `kline.isClosed === true` dari `subscribeKlineStream()`:
  - Ambil data historis terbaru dari `dataManager`
  - Jalankan `strategy.populateIndicators()` → `populateEntryTrend()`
  - Jika ada sinyal BUY/SELL → kirim notifikasi Telegram ke semua subscriber
  - Jika live trading aktif → langsung eksekusi via `realTradingEngine`

- [ ] **[F3-14]** Tambah command `/subscribe <symbol>` — user minta auto-alert sinyal
- [ ] **[F3-15]** Tambah command `/unsubscribe <symbol>` — stop auto-alert

### 3.4 Connection Manager

- [ ] **[F3-16]** Buat `src/services/connectionManager.ts` yang mengelola semua WebSocket streams
- [ ] **[F3-17]** Batasi maksimum 5 stream aktif sekaligus (limit Binance)
- [ ] **[F3-18]** Tampilkan status semua stream aktif di command `/apistatus`

---

## 🔴 FASE 4 — ML Pipeline Improvement

> **Estimasi:** 1–2 Minggu  
> **Prioritas:** 🟡 Menengah — Meningkatkan Edge  
> **Target Score:** 93 / 100

### 4.1 Walk-Forward Validation

- [ ] **[F4-1]** Buat method `walkForwardValidate(data, windowSize, stepSize)` di `SimpleGRUModel`
  - `windowSize`: jumlah candle untuk training (misal: 2000)
  - `stepSize`: geser window per iterasi (misal: 200)
  - Hasilkan array akurasi per window, lalu rata-ratakan

- [ ] **[F4-2]** Simpan hasil WFV ke tabel `MLModelMetric` dengan `modelVersion` yang berbeda per window

- [ ] **[F4-3]** Tampilkan ringkasan WFV di command `/mlstats`:
  - Akurasi rata-rata WFV
  - Akurasi terbaik / terburuk
  - Stabilitas (standar deviasi antar window)

### 4.2 Proper Data Split

- [ ] **[F4-4]** Perbaiki training pipeline di `scripts/production-training.ts`:
  - 70% train, 15% validation, 15% test
  - Split berdasarkan waktu (bukan random) — hindari data leakage
  - Simpan indeks split ke file config agar reproducible

- [ ] **[F4-5]** Implementasi early stopping berdasarkan validation loss
  - Stop training jika val_loss tidak membaik dalam 5 epoch berturut-turut
  - Simpan model terbaik (bukan yang terakhir)

- [ ] **[F4-6]** Laporkan akurasi pada test set yang terpisah setelah training selesai
  - Test set TIDAK BOLEH digunakan untuk tuning apapun
  - Ini adalah angka akurasi yang "jujur"

### 4.3 Arsitektur Model yang Lebih Baik

- [ ] **[F4-7]** Update arsitektur GRU di `src/ml/simpleGRUModel.ts`:
  - Layer 1: `GRU(64 units)` + `Dropout(0.3)`
  - Layer 2: `GRU(32 units)` + `Dropout(0.2)`
  - Layer 3: `Dense(16, activation: 'relu')` + `Dropout(0.1)`
  - Output: `Dense(3, activation: 'softmax')` — 3 kelas: UP, DOWN, NEUTRAL

- [ ] **[F4-8]** Ganti loss function dari `meanSquaredError` ke `categoricalCrossentropy`
  - Sesuai karena output sekarang adalah klasifikasi 3 kelas, bukan regresi

- [ ] **[F4-9]** Tambah `class_weight` untuk handle imbalanced dataset
  - Jika UP:DOWN:NEUTRAL = 40:30:30, berikan weight lebih ke kelas minoritas

- [ ] **[F4-10]** Implementasi `Attention Mechanism` sederhana di atas GRU layer terakhir (opsional, bonus)

### 4.4 Confidence Calibration

- [ ] **[F4-11]** Ganti confidence formula dari `Math.abs(outputNeuron)` ke probabilitas softmax
  - Confidence = `max(softmax_output)` — nilai antara 0 dan 1 yang valid secara probabilistik

- [ ] **[F4-12]** Implementasi **Platt Scaling** untuk kalibrasi confidence
  - Latih logistic regression kecil di atas raw model output menggunakan validation set
  - Hasilnya: confidence 70% benar-benar berarti 70% akurat secara historis

- [ ] **[F4-13]** Buat `calibrationTest()` — tampilkan reliability diagram (confidence vs actual accuracy per bucket)

### 4.5 Multi-timeframe Features

- [ ] **[F4-14]** Tambah fitur dari timeframe 15m ke `FeatureEngineeringService`:
  - RSI 14 (15m), MACD histogram (15m), BB %B (15m), volume ratio (15m)
  - Selaraskan timestamp dengan candle 1h (resample)

- [ ] **[F4-15]** Tambah fitur dari timeframe 4h:
  - RSI 14 (4h), EMA 50 (4h), trend direction (4h), ATR % (4h)

- [ ] **[F4-16]** Update `featureCount` di `SimpleGRUModel` sesuai jumlah fitur baru

### 4.6 Peningkatan Training Pipeline

- [ ] **[F4-17]** Update `scripts/production-training.ts` agar menggunakan WFV secara default
- [ ] **[F4-18]** Tambah logging TensorBoard-compatible (loss, val_loss, accuracy per epoch)
- [ ] **[F4-19]** Simpan hyperparameter training ke `MLModelMetric.parameters` (JSON)
- [ ] **[F4-20]** Tambah command `/trainmodel <symbol> <timeframe>` yang trigger training dari Telegram

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

- [ ] **[F6-1]** Buat Prisma schema variant untuk PostgreSQL
  - Duplikat `prisma/schema.prisma` → `prisma/schema.postgres.prisma`
  - Ganti `provider = "sqlite"` → `provider = "postgresql"`
  - Tambah `@db.Text` untuk kolom JSON (trades, equityCurve, parameters)

- [ ] **[F6-2]** Buat script migrasi data SQLite → PostgreSQL
  - File: `scripts/migrate-sqlite-to-postgres.ts`
  - Export semua data dari SQLite → Import ke PostgreSQL

- [ ] **[F6-3]** Install TimescaleDB extension untuk tabel `HistoricalData`
  - Konversi tabel `HistoricalData` menjadi hypertable berdasarkan `timestamp`
  - Buat index time-series yang optimal

- [ ] **[F6-4]** Tambah connection pooling via `PgBouncer` atau `prisma.$connect()` pool config
  - Max pool size: 10 connections
  - Connection timeout: 5 detik

### 6.2 Rate Limiter Terpusat

- [ ] **[F6-5]** Buat `src/services/rateLimiter.ts`
  - Implementasi **Token Bucket Algorithm**
  - REST API: 1200 request weight per menit
  - Order API: 10 orders per detik, 100.000 orders per hari
  - WebSocket: max 5 stream per connection, max 300 subscriptions

- [ ] **[F6-6]** Integrate `rateLimiter` ke semua fungsi di `BinanceOrderService`

- [ ] **[F6-7]** Tambah `X-MBX-USED-WEIGHT` parsing dari response header Binance
  - Update token bucket berdasarkan weight yang dikonfirmasi server

### 6.3 Health Monitoring & Auto-Alert

- [ ] **[F6-8]** Buat `src/services/healthMonitor.ts`

- [ ] **[F6-9]** Monitor dan alert ke Telegram admin jika:
  - Bot crash atau restart tidak terduga
  - Koneksi Binance terputus > 30 detik
  - WebSocket disconnect > 3 kali dalam 10 menit
  - Account drawdown melewati threshold (default 10%)
  - Model GRU akurasi drop di bawah 50% (7 hari rolling)
  - Saldo akun di bawah minimum operasional

- [ ] **[F6-10]** Implementasi `/healthcheck` command di bot
  - Tampilkan status semua komponen: DB, Binance REST, WebSocket streams, ML model
  - Tampilkan uptime, memory usage, request count

- [ ] **[F6-11]** Buat endpoint HTTP `/health` di `webServer.ts` untuk monitoring eksternal
  - Return JSON: `{ status: 'ok'|'degraded'|'down', components: {...}, uptime: N }`
  - Bisa diintegrasikan dengan UptimeRobot atau Grafana

### 6.4 Structured Logging & Audit Trail

- [ ] **[F6-12]** Implementasi structured logger menggunakan library `pino` atau `winston`
  - Install: `npm install pino pino-pretty`
  - Log format: JSON dengan fields: `timestamp`, `level`, `service`, `userId`, `symbol`, `message`, `data`
  - Log level berbeda per environment: `debug` (development), `info` (production)

- [ ] **[F6-13]** Ganti semua `console.log` dan `console.error` di `src/` dengan structured logger
  - Buat wrapper: `logger.info()`, `logger.warn()`, `logger.error()`, `logger.debug()`

- [ ] **[F6-14]** Setiap aksi trading WAJIB dicatat ke tabel `ErrorLog` dengan level `INFO`:
  - Order dikirim (params, timestamp)
  - Order confirmed/filled (executedPrice, quantity, fee)
  - SL/TP terpicu (reason, price)
  - Strategy signal generated (signal strength, indicators)

- [ ] **[F6-15]** Tambah command `/logs <N>` — tampilkan N log terakhir ke Telegram admin

### 6.5 Process Management & Deployment

- [ ] **[F6-16]** Setup PM2 untuk process management
  - Buat `ecosystem.config.js` di root project
  - Config: auto-restart on crash, max memory restart (512MB), cluster mode
  - Log rotation: max 30 hari, max 100MB per file

- [ ] **[F6-17]** Buat script deployment otomatis `scripts/deploy.sh`:
  ```
  git pull origin main
  npm ci --production
  npx prisma migrate deploy
  npm run build
  pm2 restart rabtradebot
  ```

- [ ] **[F6-18]** Setup environment yang benar:
  - `.env.development` — Binance Testnet, SQLite, log level debug
  - `.env.production` — Binance Mainnet, PostgreSQL, log level info
  - Jangan pernah commit file `.env` ke git (pastikan di `.gitignore`)

- [ ] **[F6-19]** Buat `Dockerfile` untuk containerized deployment (opsional)
  - Base image: `node:20-alpine`
  - Multi-stage build: builder → runner
  - Volume mount untuk database dan model files

### 6.6 Unit Testing & Coverage

- [ ] **[F6-20]** Buat unit test untuk `BinanceOrderService`
  - File: `tests/binanceOrderService.test.ts`
  - Mock semua HTTP calls dengan `jest.mock` atau `nock`
  - Test: round to step size, signature generation, error handling

- [ ] **[F6-21]** Buat unit test untuk `RiskMonitorLoop`
  - File: `tests/riskMonitorLoop.test.ts`
  - Test: SL trigger, TP trigger, trailing stop logic, circuit breaker

- [ ] **[F6-22]** Buat unit test untuk `FeatureEngineeringService`
  - File: `tests/featureEngineering.test.ts`
  - Test: output dimensi benar, tidak ada NaN/Infinity, cache berfungsi

- [ ] **[F6-23]** Buat unit test untuk `BacktestEngine`
  - File: `tests/backtestEngine.test.ts`
  - Test: Sharpe ratio calculation, drawdown calculation, ROI check logic

- [ ] **[F6-24]** Target coverage minimum 80% (sudah dikonfigurasi di `package.json`)
  - Jalankan: `npm test -- --coverage`

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
| `src/webServer.ts` | F6 | Tambah `/health` endpoint |
| `scripts/production-training.ts` | F4 | Proper train/val/test split, WFV |

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

### Fase 6 ✅ Done jika:
- [ ] Bot berjalan stabil di VPS selama 72 jam tanpa restart manual
- [ ] Coverage test mencapai minimal 80%
- [ ] Health endpoint `/health` mengembalikan status yang akurat
- [ ] Admin menerima alert Telegram saat bot sengaja di-crash untuk testing

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
| **TOTAL** | **54/120** | **105/120** ≈ **100/100** |

---

*Dokumen ini adalah living document — update status setiap task saat selesai dikerjakan.*  
*Legend: ⏳ Pending | 🔄 In Progress | ✅ Done | ❌ Cancelled | ⏸️ Blocked*