# Contributing to RabTradebot

> Your code shapes the way traders analyze, simulate, and execute. Thank you for contributing.

First, thank you for taking the time to contribute! It is contributors like you who make this project better for everyone. By contributing to RabTradebot, you agree to abide by our code of conduct and standard engineering practices.

## Why We Need You

The quant trading ecosystem evolves fast, and keeping the bot's capabilities edge-sharp requires community input. Whether you're fixing a bug, adding a new Telegram command, optimizing the machine learning models, or writing documentation (we *love* docs!), your contributions have a direct impact on the tool's effectiveness.

## Quick Start

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/yourusername/crypto-signal-bot.git
   cd crypto-signal-bot
   ```
3. **Install dependencies** (we use `pnpm`):
   ```bash
   pnpm install
   ```
4. **Create a branch** for your work:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Contribution Workflow

### Step 1: Discuss Before You Build

If you are planning a significant change (e.g., architectural overhaul, new ML models, changing database providers), please open an **Issue** to discuss it first. This saves you from writing code that might not align with the roadmap.

### Step 2: Code Guidelines

- **TypeScript First:** All new code must be written in TypeScript. Follow existing typing patterns. Avoid `any`.
- **Formatting:** We use Prettier for formatting. Ensure your code conforms by running:
  ```bash
  pnpm run format
  ```
- **Linting:** Keep it clean. We use ESLint.
  ```bash
  pnpm run lint
  ```
- **Testing:** New features should include relevant test cases. We use Jest.
  ```bash
  pnpm test
  ```

### Step 3: Document Everything

Bad documentation is a bug. If you add a new feature, a new command, or change how a system works:
1. Update `README.md` if it changes the core setup or usage.
2. Write inline code documentation (JSDoc) for complex functions.
3. If it requires environment variables, add them to `.env.example`.

### Step 4: Submit a Pull Request (PR)

- Push your branch to your fork.
- Open a PR against the `main` branch.
- Provide a clear PR description: why you made the change, what it does, and how to test it.
- Your PR will trigger CI checks. Ensure all tests and linters pass.

## Architecture Highlights

When contributing to core services, familiarize yourself with our module architecture:
- `src/services/binanceOrderService.ts`: Core API bindings for Binance interactions (REST).
- `src/services/realTradingEngine.ts` / `src/services/paperTradingEngine.ts`: Logic for actual vs. simulated executions.
- `src/services/riskMonitorLoop.ts`: Background polling and WebSocket-based risk management (SL/TP).
- `src/ml/`: Feature engineering and Machine Learning inference loops (e.g., SimpleGRUModel).

## Getting Help

If you're stuck, refer to the [ROADMAP_TODO.md](ROADMAP_TODO.md) for context on where the project is heading, or open a draft PR and ask for help. We're happy to guide you!
