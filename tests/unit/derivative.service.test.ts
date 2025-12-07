import { generateDerivatives } from '@/services/derivative.service';
import * as derivativeRepository from '@/database/derivative.repository';
import * as ipfsService from '@/services/ipfs.service';
import * as llmService from '@/services/llm.service';
import { IAQIReading } from '@/types/aqi-reading.types';
import { IDerivative } from '@/types/derivative.types';
import { Types } from 'mongoose';

// Mock the dependencies
jest.mock('@/database/derivative.repository');
jest.mock('@/services/ipfs.service');
jest.mock('@/services/llm.service');
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('Derivative Service', () => {
  let mockReadings: IAQIReading[];

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Create mock data
    mockReadings = [
      {
        _id: new Types.ObjectId(),
        reading_id: 'dev1_2025-11-01_H19',
        batch_window: { start: new Date('2025-11-01T19:00:00Z'), hour_index: 19 },
        sensor_data: { pm10: [659.6] },
        meta: { location: { station: 'Test Station' } },
      },
    ] as unknown as IAQIReading[];

    // Mock service responses
    (llmService.loadPromptTemplate as jest.Mock).mockResolvedValue('template content');
    (llmService.generateInference as jest.Mock).mockResolvedValue({
      content: '# 📜 Mock Daily Log',
      model: 'mock-model',
      tokensUsed: { input: 100, output: 50, total: 150 },
      costUSD: 0.0001,
      processingTimeMs: 500,
    });
    
    (ipfsService.pinJSONToIPFS as jest.Mock).mockResolvedValue({
      ipfsHash: 'QmTestHash',
      ipfsUri: 'ipfs://QmTestHash',
      pinSize: 1024,
    });

    (derivativeRepository.createDerivative as jest.Mock).mockImplementation(
      async (derivative: Partial<IDerivative>) => derivative as any
    );
  });

  it('should generate a daily derivative using the LLM service', async () => {
    await generateDerivatives(mockReadings);

    // 1. Check that createDerivative was called
    expect(derivativeRepository.createDerivative).toHaveBeenCalledTimes(1);

    // 2. Check the derivative content
    const createdDerivative = (derivativeRepository.createDerivative as jest.Mock).mock.calls[0][0];
    expect(createdDerivative.type).toBe('DAILY');
    expect(createdDerivative.content).toBe('# 📜 Mock Daily Log');
    expect(createdDerivative.parent_data_ids).toEqual([mockReadings[0].reading_id]);

    // 3. Check that LLM metadata was saved correctly
    expect(createdDerivative.llm_metadata).toBeDefined();
    expect(createdDerivative.llm_metadata.model).toBe('mock-model');
    expect(createdDerivative.llm_metadata.tokens_used.total).toBe(150);
    expect(createdDerivative.llm_metadata.cost_usd).toBe(0.0001);

    // 4. Check that IPFS pinning was called
    expect(ipfsService.pinJSONToIPFS).toHaveBeenCalledTimes(1);
    const ipfsPayload = (ipfsService.pinJSONToIPFS as jest.Mock).mock.calls[0][0];
    expect(ipfsPayload.keyvalues.content).toBe('# 📜 Mock Daily Log');
  });

  it('should handle an empty array of readings', async () => {
    await generateDerivatives([]);
    expect(derivativeRepository.createDerivative).not.toHaveBeenCalled();
    expect(llmService.generateInference).not.toHaveBeenCalled();
  });

  it('should handle LLM service failure gracefully', async () => {
    // Force the LLM service to fail
    (llmService.generateInference as jest.Mock).mockRejectedValue(new Error('LLM API is down'));

    await generateDerivatives(mockReadings);

    // Ensure that even if the LLM fails, we don't create a derivative
    expect(derivativeRepository.createDerivative).not.toHaveBeenCalled();
    
    // Check that the error was logged
    expect((jest.requireMock('@/utils/logger') as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to generate derivative for day'),
        expect.any(Error)
    );
  });
});
