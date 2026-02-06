import { ImageChartService } from './imageChartService';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

jest.mock('chartjs-node-canvas');

describe('ImageChartService', () => {
    let service: ImageChartService;
    let mockRenderToBuffer: jest.Mock;

    beforeEach(() => {
        mockRenderToBuffer = jest.fn().mockResolvedValue(Buffer.from('mock'));
        (ChartJSNodeCanvas as unknown as jest.Mock).mockImplementation(() => ({
            renderToBuffer: mockRenderToBuffer
        }));
        service = new ImageChartService();
    });

    it('should calculate min and max price correctly', async () => {
        // Create 60 candles
        const data = Array.from({ length: 60 }, (_, i) => ({
            t: i * 60000,
            o: 100,
            h: 110, // Default high
            l: 90,  // Default low
            c: 105
        }));

        // Introduce specific min and max
        data[10].h = 120; // Max high
        data[20].l = 80;  // Min low

        await service.generateCandlestickChart('BTCUSDT', '1h', data);

        const config = mockRenderToBuffer.mock.calls[0][0];
        const yScale = config.options.scales.y;

        // Expected: min = 80 * 0.995 = 79.6
        // Expected: max = 120 * 1.005 = 120.6
        expect(yScale.min).toBeCloseTo(79.6);
        expect(yScale.max).toBeCloseTo(120.6);
    });
});
