import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

export interface TradingConfig {
    stake_currency: string;
    stake_amount: number;
    max_open_trades: number;
    timeframe: string;
    dry_run: boolean;
    dry_run_wallet: number;
    cancel_open_orders_on_exit: boolean;
}

export interface ExchangeConfig {
    name: string;
    sandbox: boolean;
    key: string;
    secret: string;
    pair_whitelist: string[];
    pair_blacklist: string[];
}

export interface TelegramConfig {
    enabled: boolean;
    token: string;
    chat_id: string;
    notification_settings: {
        [key: string]: string;
    };
}

export interface BotConfig {
    trading: TradingConfig;
    exchange: ExchangeConfig;
    telegram: TelegramConfig;
    strategy: string;
    strategy_path: string;
    initial_state: string;
    internals: {
        process_throttle_secs: number;
        heartbeat_interval: number;
    };
}

export class ConfigManager {
    private config: BotConfig;
    private configPath: string;

    constructor(configPath: string = 'config/config.json') {
        this.configPath = path.resolve(configPath);
        this.config = this.loadConfig();
    }

    private loadConfig(): BotConfig {
        try {
            if (!fs.existsSync(this.configPath)) {
                throw new Error(`Config file not found: ${this.configPath}`);
            }

            const configData = fs.readFileSync(this.configPath, 'utf8');
            const config = JSON.parse(configData) as BotConfig;
            
            // Validate required fields
            this.validateConfig(config);
            
            logger.info(`✅ Configuration loaded from ${this.configPath}`);
            return config;
            
        } catch (error) {
            logger.error({ err: error }, '❌ Error loading configuration:');
            throw error;
        }
    }

    private validateConfig(config: any): void {
        const requiredFields = [
            'trading',
            'exchange',
            'strategy'
        ];

        for (const field of requiredFields) {
            if (!(field in config)) {
                throw new Error(`Missing required configuration field: ${field}`);
            }
        }

        // Validate trading config
        if (!config.trading.stake_currency) {
            throw new Error('stake_currency is required in trading configuration');
        }

        if (!config.exchange.name) {
            throw new Error('exchange.name is required');
        }

        if (!config.strategy) {
            throw new Error('strategy is required');
        }
    }

    public getConfig(): BotConfig {
        return { ...this.config };
    }

    public getTradingConfig(): TradingConfig {
        return { ...this.config.trading };
    }

    public getExchangeConfig(): ExchangeConfig {
        return { ...this.config.exchange };
    }

    public getTelegramConfig(): TelegramConfig {
        return { ...this.config.telegram };
    }

    public updateConfig(updates: Partial<BotConfig>): void {
        this.config = { ...this.config, ...updates };
        this.saveConfig();
    }

    public saveConfig(): void {
        try {
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            logger.info(`✅ Configuration saved to ${this.configPath}`);
        } catch (error) {
            logger.error({ err: error }, '❌ Error saving configuration:');
            throw error;
        }
    }

    public static createDefaultConfig(outputPath: string): void {
        const defaultConfig: BotConfig = {
            trading: {
                stake_currency: "USDT",
                stake_amount: 100,
                max_open_trades: 3,
                timeframe: "5m",
                dry_run: true,
                dry_run_wallet: 1000,
                cancel_open_orders_on_exit: false
            },
            exchange: {
                name: "binance",
                sandbox: false,
                key: "",
                secret: "",
                pair_whitelist: [
                    "BTC/USDT",
                    "ETH/USDT",
                    "BNB/USDT"
                ],
                pair_blacklist: []
            },
            telegram: {
                enabled: true,
                token: "",
                chat_id: "",
                notification_settings: {
                    status: "on",
                    entry: "on",
                    exit: "on"
                }
            },
            strategy: "SampleStrategy",
            strategy_path: "user_data/strategies/",
            initial_state: "running",
            internals: {
                process_throttle_secs: 5,
                heartbeat_interval: 60
            }
        };

        const configDir = path.dirname(outputPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        fs.writeFileSync(outputPath, JSON.stringify(defaultConfig, null, 2));
        logger.info(`✅ Default configuration created at ${outputPath}`);
    }

    // Environment variable integration
    public loadFromEnvironment(): void {
        // Override config with environment variables if present
        if (process.env.STAKE_CURRENCY) {
            this.config.trading.stake_currency = process.env.STAKE_CURRENCY;
        }
        
        if (process.env.STAKE_AMOUNT) {
            this.config.trading.stake_amount = parseFloat(process.env.STAKE_AMOUNT);
        }
        
        if (process.env.MAX_OPEN_TRADES) {
            this.config.trading.max_open_trades = parseInt(process.env.MAX_OPEN_TRADES);
        }
        
        if (process.env.BINANCE_API_KEY) {
            this.config.exchange.key = process.env.BINANCE_API_KEY;
        }
        
        if (process.env.BINANCE_API_SECRET) {
            this.config.exchange.secret = process.env.BINANCE_API_SECRET;
        }
        
        if (process.env.TELEGRAM_BOT_TOKEN) {
            this.config.telegram.token = process.env.TELEGRAM_BOT_TOKEN;
        }
        
        if (process.env.TELEGRAM_CHAT_ID) {
            this.config.telegram.chat_id = process.env.TELEGRAM_CHAT_ID;
        }

        logger.info('✅ Configuration updated with environment variables');
    }

    // Configuration validation methods
    public validateTradingSetup(): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Check trading parameters
        if (this.config.trading.stake_amount <= 0) {
            errors.push('stake_amount must be greater than 0');
        }

        if (this.config.trading.max_open_trades <= 0) {
            errors.push('max_open_trades must be greater than 0');
        }

        if (this.config.trading.dry_run_wallet <= 0) {
            errors.push('dry_run_wallet must be greater than 0');
        }

        // Check exchange configuration
        if (this.config.exchange.pair_whitelist.length === 0) {
            errors.push('pair_whitelist cannot be empty');
        }

        // Check if we have enough balance for trading
        const minBalance = this.config.trading.stake_amount * this.config.trading.max_open_trades;
        if (this.config.trading.dry_run_wallet < minBalance) {
            errors.push(`dry_run_wallet (${this.config.trading.dry_run_wallet}) is too small for max_open_trades * stake_amount (${minBalance})`);
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    public getConfigSummary(): string {
        const validation = this.validateTradingSetup();
        
        return `
📊 TRADING CONFIGURATION SUMMARY

💰 Trading Settings:
- Stake Currency: ${this.config.trading.stake_currency}
- Stake Amount: ${this.config.trading.stake_amount}
- Max Open Trades: ${this.config.trading.max_open_trades}
- Timeframe: ${this.config.trading.timeframe}
- Dry Run: ${this.config.trading.dry_run ? 'Yes' : 'No'}
- Dry Run Wallet: ${this.config.trading.dry_run_wallet}

🏪 Exchange Settings:
- Exchange: ${this.config.exchange.name}
- Sandbox: ${this.config.exchange.sandbox ? 'Yes' : 'No'}
- Whitelisted Pairs: ${this.config.exchange.pair_whitelist.length}
- Blacklisted Pairs: ${this.config.exchange.pair_blacklist.length}

🤖 Strategy Settings:
- Strategy: ${this.config.strategy}
- Strategy Path: ${this.config.strategy_path}

📱 Telegram Settings:
- Enabled: ${this.config.telegram.enabled ? 'Yes' : 'No'}
- Token Configured: ${this.config.telegram.token ? 'Yes' : 'No'}

✅ Configuration Status: ${validation.isValid ? 'Valid' : 'Invalid'}
${validation.errors.length > 0 ? '\n❌ Errors:\n' + validation.errors.join('\n') : ''}
        `;
    }
}
