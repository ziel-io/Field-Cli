/**
 * Field CLI - Envelope Factory and Conversion
 * 处理 Envelope 创建和 v2.1 → v2.2 转换
 */

import type {
  Envelope,
  EnvelopeSuccess,
  EnvelopeFailure,
  EnvelopeMeta,
  EnvelopeV21,
  RiskLevel,
} from '../types.js';
import { aggregateRisk } from './risk-aggregator.js';

// =============================================================================
// v2.1 to v2.2 Conversion
// =============================================================================

/**
 * 将 v2.1 Envelope 转换为 v2.2 Envelope
 * 自动添加 meta 字段
 */
export function wrapV21ToV22(
  v21Response: Record<string, unknown>,
  riskRule?: string
): Envelope {
  // 已经是 v2.2
  if ('meta' in v21Response) {
    return v21Response as unknown as Envelope;
  }

  if (v21Response['ok'] === true) {
    const data = (v21Response['data'] ?? {}) as Record<string, unknown>;

    // 从 data 中提取或计算 meta 字段
    const confidence =
      typeof data['confidence'] === 'number' ? data['confidence'] : 0.5;
    const rationale =
      typeof data['rationale'] === 'string' ? data['rationale'] : '';

    return {
      ok: true,
      meta: {
        confidence,
        risk: aggregateRisk(data, riskRule as any),
        explain: rationale.substring(0, 280) || 'No explanation provided',
      },
      data,
    } as EnvelopeSuccess;
  } else {
    const error = (v21Response['error'] ?? {
      code: 'UNKNOWN',
      message: 'Unknown error',
    }) as { code: string; message: string };

    return {
      ok: false,
      meta: {
        confidence: 0.0,
        risk: 'high',
        explain: (error.message || 'An error occurred').substring(0, 280),
      },
      error,
      partial_data: v21Response['partial_data'] as Record<string, unknown> | null,
    } as EnvelopeFailure;
  }
}

// =============================================================================
// Legacy to Envelope Conversion
// =============================================================================

/**
 * 将旧格式（无 envelope）转换为 v2.2 envelope
 */
export function convertLegacyToEnvelope(
  data: Record<string, unknown>,
  isError = false
): Envelope {
  if (isError || 'error' in data) {
    const error = data['error'] as Record<string, unknown> | string | undefined;
    const errorMsg =
      typeof error === 'object' && error !== null
        ? String(error['message'] ?? error)
        : String(error ?? 'Unknown error');

    return {
      ok: false,
      meta: {
        confidence: 0.0,
        risk: 'high',
        explain: errorMsg.substring(0, 280),
      },
      error: {
        code:
          typeof error === 'object' && error !== null
            ? String(error['code'] ?? 'UNKNOWN')
            : 'UNKNOWN',
        message: errorMsg,
      },
      partial_data: null,
    };
  } else {
    // 旧格式成功响应 - data 就是 payload
    const confidence =
      typeof data['confidence'] === 'number' ? data['confidence'] : 0.5;
    const rationale =
      typeof data['rationale'] === 'string' ? data['rationale'] : '';

    return {
      ok: true,
      meta: {
        confidence,
        risk: aggregateRisk(data),
        explain: rationale.substring(0, 280) || 'No explanation provided',
      },
      data,
    };
  }
}

// =============================================================================
// Envelope Factory Functions
// =============================================================================

/**
 * 创建成功 Envelope
 */
export function createSuccessEnvelope(
  data: Record<string, unknown>,
  meta: Partial<EnvelopeMeta> = {}
): EnvelopeSuccess {
  const confidence =
    meta.confidence ?? (typeof data['confidence'] === 'number' ? data['confidence'] : 0.5);
  const rationale =
    typeof data['rationale'] === 'string' ? data['rationale'] : '';

  return {
    ok: true,
    meta: {
      confidence,
      risk: meta.risk ?? aggregateRisk(data),
      explain: meta.explain ?? (rationale.substring(0, 280) || 'No explanation provided'),
    },
    data,
  };
}

/**
 * 创建失败 Envelope
 */
export function createFailureEnvelope(
  code: string,
  message: string,
  meta: Partial<EnvelopeMeta> = {},
  partialData: Record<string, unknown> | null = null
): EnvelopeFailure {
  return {
    ok: false,
    meta: {
      confidence: meta.confidence ?? 0.0,
      risk: meta.risk ?? 'high',
      explain: meta.explain ?? message.substring(0, 280),
    },
    error: { code, message },
    partial_data: partialData,
  };
}

// =============================================================================
// Standard Error Envelopes
// =============================================================================

/**
 * 创建解析错误 Envelope
 */
export function createParseError(rawResponse?: string): EnvelopeFailure {
  return createFailureEnvelope(
    'PARSE_ERROR',
    'Failed to parse LLM response as JSON',
    { confidence: 0.0, risk: 'high', explain: 'Failed to parse LLM response as JSON.' }
  );
}

/**
 * 创建输入验证错误 Envelope
 */
export function createInvalidInputError(errors: string[]): EnvelopeFailure {
  return createFailureEnvelope(
    'INVALID_INPUT',
    errors.join('; '),
    {
      confidence: 1.0, // 确定是调用者的问题
      risk: 'none',
      explain: 'Input validation failed.',
    }
  );
}

/**
 * 创建模块未找到错误 Envelope
 */
export function createModuleNotFoundError(name: string): EnvelopeFailure {
  return createFailureEnvelope(
    'MODULE_NOT_FOUND',
    `Module not found: ${name}`,
    {
      confidence: 1.0,
      risk: 'high',
      explain: `Module '${name}' not found.`,
    }
  );
}

/**
 * 创建 Schema 验证错误 Envelope
 */
export function createSchemaValidationError(
  errors: string[],
  partialData: Record<string, unknown> | null = null
): EnvelopeFailure {
  return createFailureEnvelope(
    'SCHEMA_VALIDATION_FAILED',
    errors.join('; '),
    {
      confidence: 0.0,
      risk: 'high',
      explain: 'Schema validation failed after repair attempt.',
    },
    partialData
  );
}

/**
 * 创建内部错误 Envelope
 */
export function createInternalError(message: string): EnvelopeFailure {
  return createFailureEnvelope(
    'INTERNAL_ERROR',
    message,
    {
      confidence: 0.0,
      risk: 'high',
      explain: 'An internal error occurred.',
    }
  );
}

/**
 * 创建深度超限错误 Envelope
 */
export function createMaxDepthError(maxDepth: number): EnvelopeFailure {
  return createFailureEnvelope(
    'MAX_DEPTH_EXCEEDED',
    `Max subagent depth (${maxDepth}) exceeded. Check for circular calls.`,
    {
      confidence: 1.0,
      risk: 'high',
      explain: 'Subagent call depth limit exceeded.',
    }
  );
}

/**
 * 创建循环调用错误 Envelope
 */
export function createCircularCallError(moduleName: string): EnvelopeFailure {
  return createFailureEnvelope(
    'CIRCULAR_CALL',
    `Circular call detected: ${moduleName}`,
    {
      confidence: 1.0,
      risk: 'high',
      explain: 'Circular module call detected.',
    }
  );
}

// =============================================================================
// Envelope Detection
// =============================================================================

/**
 * 检测是否是 v2.2 Envelope（有 meta 字段）
 */
export function isV22Envelope(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return typeof obj['ok'] === 'boolean' && typeof obj['meta'] === 'object';
}

/**
 * 检测是否是 v2.1 Envelope（无 meta 字段）
 */
export function isV21Envelope(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return typeof obj['ok'] === 'boolean' && !('meta' in obj);
}

/**
 * 自动检测并转换为 v2.2 Envelope
 */
export function ensureV22Envelope(data: unknown, riskRule?: string): Envelope | null {
  if (typeof data !== 'object' || data === null) return null;
  
  const obj = data as Record<string, unknown>;
  
  if (isV22Envelope(obj)) {
    return obj as unknown as Envelope;
  }
  
  if (isV21Envelope(obj)) {
    return wrapV21ToV22(obj, riskRule);
  }
  
  // 尝试作为旧格式处理
  if ('ok' in obj || 'data' in obj || 'error' in obj) {
    return convertLegacyToEnvelope(obj, 'error' in obj);
  }
  
  return null;
}
