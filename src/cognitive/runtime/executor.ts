/**
 * Field CLI - Cognitive Runtime Executor
 * 执行 Cognitive 模块的核心引擎
 */

import {
  CognitiveModule,
  Envelope,
  ExecutionOptions,
  ExecutionResult,
  ExecutionMetrics,
} from '../types.js';
import { validateInput } from '../validator/schema.js';
import { validateEnvelope, parseEnvelope } from '../validator/envelope.js';
import { repairEnvelope, buildEnvelopeFromText } from './repair.js';
import { metricsCollector } from './metrics.js';
import { LLMClient, Message } from '../../llm.js';

// 重试配置
const DEFAULT_MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // 指数退避

/**
 * 构建系统 Prompt
 */
function buildSystemPrompt(module: CognitiveModule): string {
  const { manifest, schema } = module;

  return `You are a Cognitive Module executor. You MUST respond in valid JSON format following the Envelope specification.

## Module: ${manifest.name}
## Version: ${manifest.version}
## Tier: ${manifest.tier}
## Responsibility: ${manifest.responsibility}

## Response Format (REQUIRED)

You MUST respond with a JSON object in this exact format:

### Success Response:
\`\`\`json
{
  "ok": true,
  "meta": {
    "confidence": <number 0-1>,
    "risk": "<none|low|medium|high>",
    "explain": "<brief explanation, max 280 chars>"
  },
  "data": {
    // Your response data here, must match the data schema
  }
}
\`\`\`

### Error Response:
\`\`\`json
{
  "ok": false,
  "meta": {
    "confidence": 0,
    "risk": "high",
    "explain": "<error explanation>"
  },
  "error": {
    "code": "<ERROR_CODE>",
    "message": "<error message>"
  }
}
\`\`\`

## Data Schema
\`\`\`json
${JSON.stringify(schema.data, null, 2)}
\`\`\`

## Meta Schema
\`\`\`json
${JSON.stringify(schema.meta, null, 2)}
\`\`\`

## Excludes (DO NOT do these):
${manifest.excludes?.map((e) => `- ${e}`).join('\n') || 'None'}

IMPORTANT: 
- Always respond with valid JSON only
- No markdown, no explanations outside the JSON
- confidence must be between 0 and 1
- risk must be exactly one of: none, low, medium, high
`;
}

/**
 * 构建用户 Prompt
 */
function buildUserPrompt(module: CognitiveModule, input: unknown): string {
  return `${module.prompt}

## Input Data:
\`\`\`json
${JSON.stringify(input, null, 2)}
\`\`\`

Respond with a valid JSON envelope.`;
}

/**
 * 判断错误是否可重试
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // 网络错误
    if (message.includes('econnreset') || message.includes('timeout') || message.includes('network')) {
      return true;
    }
    // 速率限制
    if (message.includes('429') || message.includes('rate limit')) {
      return true;
    }
    // 服务器错误
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
      return true;
    }
  }
  return false;
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 执行 Cognitive 模块
 */
export async function executeModule(
  module: CognitiveModule,
  client: LLMClient,
  provider: string,
  options: ExecutionOptions
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  let retryCount = 0;
  let repairAttempts = 0;
  let lastError: Error | null = null;

  // 验证输入
  const inputValidation = validateInput(options.input, module.schema.input);
  if (!inputValidation.valid) {
    const envelope: Envelope = {
      ok: false,
      meta: {
        confidence: 0,
        risk: 'high',
        explain: 'Input validation failed',
      },
      error: {
        code: 'INPUT_VALIDATION_ERROR',
        message: inputValidation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
      },
    };

    return {
      success: false,
      envelope,
      metrics: createMetrics(startTime, 0, 0, 0, 0),
      repaired: false,
    };
  }

  // 构建消息
  const messages: Message[] = [
    { role: 'system', content: buildSystemPrompt(module) },
    { role: 'user', content: buildUserPrompt(module, options.input) },
  ];

  // 重试循环
  while (retryCount <= maxRetries) {
    try {
      let responseText = '';

      // 流式或非流式执行
      if (options.stream && options.onChunk) {
        for await (const chunk of client.chat(messages)) {
          responseText += chunk;
          options.onChunk(chunk, false);
        }
        options.onChunk('', true);
      } else {
        responseText = await client.chatSync(messages);
      }

      // 解析响应
      let envelope = parseEnvelope(responseText);

      if (!envelope) {
        // 无法解析为 Envelope，构建一个
        envelope = buildEnvelopeFromText(responseText, true);
        repairAttempts++;
      }

      // 验证 Envelope
      const validation = validateEnvelope(envelope, module.schema);

      if (!validation.valid) {
        // 尝试修复
        const repairResult = repairEnvelope(envelope, module.schema);
        if (repairResult.success) {
          envelope = repairResult.repaired;
          repairAttempts++;
        }
      }

      // 估算 token (简单估算)
      const promptTokens = Math.ceil(messages.map((m) => m.content).join('').length / 4);
      const completionTokens = Math.ceil(responseText.length / 4);

      const metrics = createMetrics(
        startTime,
        promptTokens,
        completionTokens,
        retryCount,
        repairAttempts
      );

      // 记录指标
      metricsCollector.record(module.name, provider, metrics, envelope.ok, repairAttempts > 0);

      return {
        success: envelope.ok,
        envelope,
        metrics,
        repaired: repairAttempts > 0,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (isRetryableError(error) && retryCount < maxRetries) {
        const delayMs = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
        await delay(delayMs);
        retryCount++;
      } else {
        break;
      }
    }
  }

  // 所有重试失败
  const envelope: Envelope = {
    ok: false,
    meta: {
      confidence: 0,
      risk: 'high',
      explain: `Execution failed after ${retryCount} retries`,
    },
    error: {
      code: 'EXECUTION_ERROR',
      message: lastError?.message || 'Unknown error',
    },
  };

  const metrics = createMetrics(startTime, 0, 0, retryCount, repairAttempts);
  metricsCollector.record(module.name, provider, metrics, false, false);

  return {
    success: false,
    envelope,
    metrics,
    repaired: false,
  };
}

/**
 * 创建执行指标
 */
function createMetrics(
  startTime: number,
  promptTokens: number,
  completionTokens: number,
  retryCount: number,
  repairAttempts: number
): ExecutionMetrics {
  const endTime = Date.now();
  return {
    startTime,
    endTime,
    latencyMs: endTime - startTime,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    retryCount,
    repairAttempts,
  };
}
