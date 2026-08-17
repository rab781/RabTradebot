import fs from 'fs';
import path from 'path';

describe('DEV1-B architecture guards', () => {
    const enhancedBotSource = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'enhancedBot.ts'),
        'utf8',
    );
    const applicationSource = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'services', 'tradingApplicationService.ts'),
        'utf8',
    );
    const engineSource = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'services', 'realTradingEngine.ts'),
        'utf8',
    );

    test('live signal path consumes the composite canonical entry gate', () => {
        expect(enhancedBotSource).toContain(
            'spotLiveEntryGateService.getEntryGate(symbol)',
        );
        expect(enhancedBotSource).not.toContain(
            'spotMicrostructureRuntimeRegistry.getEntryGate(symbol);',
        );
    });

    test('read-only application state projects the same composite entry gate', () => {
        expect(applicationSource).toContain(
            'spotLiveEntryGateService.getEntryGate(symbol, now)',
        );
    });

    test('core engine singleton has a final Binance REST NEW-entry guard', () => {
        expect(engineSource).toContain(
            'this.assertNewEntryOperationalReady();',
        );
        expect(engineSource).toContain(
            'binanceRestOperationalState,',
        );
    });
});
