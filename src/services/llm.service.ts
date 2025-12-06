import axios, { AxiosError } from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { LLM_CONFIG } from '../config/constants';
import { logger } from '../utils/logger';

// --- Type Definitions ---

interface TogetherAIRequest {
  model: string;
  messages: { role: 'system' | 'user'; content: string }[];
  temperature?: number;
  max_tokens?: number;
}

interface TogetherAIResponse {
  id: string;
  choices: {
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  created: number;
}

export interface LLMGenerationResult {
  content: string;
  model: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  costUSD: number;
  processingTimeMs: number;
}

// --- Service Implementation ---

const togetherAIApi = axios.create({
  baseURL: 'https://api.together.xyz/v1',
  headers: {
    Authorization: `Bearer ${LLM_CONFIG.API_KEY}`,
    'Content-Type': 'application/json',
  },
});

/**
 * Loads a prompt template from the filesystem.
 * @param templateName The name of the template file (e.g., 'daily_log.template.md').
 * @returns The content of the template file.
 */
export const loadPromptTemplate = async (templateName: string): Promise<string> => {
  const templatePath = path.join(process.cwd(), 'src', 'config', 'prompts', templateName);
  try {
    return await fs.readFile(templatePath, 'utf-8');
  } catch (error) {
    logger.error(`Failed to load prompt template: ${templateName}`, { error });
    throw new Error(`Could not load prompt template: ${templateName}`);
  }
};

/**
 * Generates an AI-powered narrative using the Together AI API with retry logic.
 *
 * @param systemPrompt The system instructions for the LLM.
 * @param userPrompt The user-facing prompt with injected data.
 * @param model The model to use for the generation.
 * @param temperature The creativity/randomness of the output.
 * @param maxTokens The maximum number of tokens to generate.
 * @returns A promise that resolves to the structured LLM generation result.
 */
export const generateInference = async (
  systemPrompt: string,
  userPrompt: string,
  model: string,
  temperature: number,
  maxTokens: number
): Promise<LLMGenerationResult> => {
  const startTime = Date.now();
  const requestBody: TogetherAIRequest = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
  };

  let lastError: Error | null = null;
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await togetherAIApi.post<TogetherAIResponse>('/chat/completions', requestBody);
      const data = response.data;
      const processingTimeMs = Date.now() - startTime;

      if (!data.choices || data.choices.length === 0) {
        throw new Error('Invalid response from LLM: No choices returned.');
      }

      const tokensUsed = {
        input: data.usage.prompt_tokens,
        output: data.usage.completion_tokens,
        total: data.usage.total_tokens,
      };

      // Note: Cost calculation is an estimate. Refer to Together AI's official pricing.
      const costUSD = calculateCost(model, tokensUsed.input, tokensUsed.output);

      logger.info('LLM inference successful', { model, processingTimeMs, tokensUsed, costUSD });

      return {
        content: data.choices[0].message.content,
        model,
        tokensUsed,
        costUSD,
        processingTimeMs,
      };

    } catch (error) {
      lastError = error as Error;
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      
      logger.warn(`LLM inference attempt ${attempt + 1} failed.`, { status, message: lastError.message });

      // Retry on server errors or rate limiting, but not on client errors (4xx)
      if (status && status >= 400 && status < 500 && status !== 429) {
        break; // Don't retry on bad requests (e.g., 400, 401, 404)
      }

      attempt++;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff (2s, 4s, ...)
        logger.info(`Retrying LLM call in ${delay / 1000}s...`);
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
  
  logger.error('LLM inference failed after all retries.', { error: lastError?.message });
  throw new Error(`Failed to get a response from the LLM after ${maxRetries} attempts. Last error: ${lastError?.message}`);
};


/**
 * Calculates the estimated cost of an LLM call based on model and token usage.
 * NOTE: These prices are for demonstration and may not be up-to-date.
 * Always refer to the official Together AI pricing page.
 * Prices are per 1 Million tokens.
 */
const calculateCost = (model: string, inputTokens: number, outputTokens: number): number => {
    const pricesPerMillionTokens: Record<string, { input: number; output: number }> = {
        'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': { input: 0.59, output: 0.79 },
        'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': { input: 2.5, output: 2.5 },
        'default': { input: 0.2, output: 0.2 }, // A default fallback
    };

    const modelPrice = pricesPerMillionTokens[model] || pricesPerMillionTokens['default'];
    
    const inputCost = (inputTokens / 1_000_000) * modelPrice.input;
    const outputCost = (outputTokens / 1_000_000) * modelPrice.output;

    return inputCost + outputCost;
}
