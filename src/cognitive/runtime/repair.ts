/**
 * Field CLI - Repair Pass
 * 自动修复轻微的 Schema 违规
 */

import {
  Envelope,
  EnvelopeMeta,
  ModuleSchema,
  ValidationError,
  RiskLevel,
} from '../types.js';
import { validateEnvelope } from '../validator/envelope.js';

interface RepairResult {
  repaired: Envelope;
  fixes: string[];
  success: boolean;
}

/**
 * 尝试修复 Envelope
 */
export function repairEnvelope(
  envelope: Envelope,
  schema: ModuleSchema
): RepairResult {
  const fixes: string[] = [];
  let repaired = JSON.parse(JSON.stringify(envelope)) as Envelope;

  // 修复 meta
  repaired = repairMeta(repaired, fixes);

  // 修复 data (成功时)
  if (repaired.ok && repaired.data) {
    repaired = repairData(repaired, schema, fixes);
  }

  // 修复 error (失败时)
  if (!repaired.ok && repaired.error) {
    repaired = repairError(repaired, fixes);
  }

  // 验证修复后的结果
  const validation = validateEnvelope(repaired, schema);

  return {
    repaired,
    fixes,
    success: validation.valid,
  };
}

/**
 * 修复 meta 字段
 */
function repairMeta(envelope: Envelope, fixes: string[]): Envelope {
  const meta = envelope.meta as Record<string, unknown>;

  // 修复 confidence
  if (typeof meta.confidence !== 'number') {
    meta.confidence = 0.5;
    fixes.push('Set default confidence: 0.5');
  } else if (meta.confidence < 0) {
    meta.confidence = 0;
    fixes.push('Clamped confidence to 0');
  } else if (meta.confidence > 1) {
    meta.confidence = 1;
    fixes.push('Clamped confidence to 1');
  }

  // 修复 risk
  const validRisks: RiskLevel[] = ['none', 'low', 'medium', 'high'];
  if (typeof meta.risk !== 'string' || !validRisks.includes(meta.risk as RiskLevel)) {
    // 尝试推断 risk
    if (typeof meta.risk === 'string') {
      const lower = meta.risk.toLowerCase();
      if (lower.includes('high') || lower.includes('危') || lower.includes('严重')) {
        meta.risk = 'high';
      } else if (lower.includes('medium') || lower.includes('中') || lower.includes('一般')) {
        meta.risk = 'medium';
      } else if (lower.includes('low') || lower.includes('低') || lower.includes('轻')) {
        meta.risk = 'low';
      } else {
        meta.risk = 'low';
      }
    } else {
      meta.risk = 'low';
    }
    fixes.push(`Set risk to: ${meta.risk}`);
  }

  // 修复 explain
  if (typeof meta.explain !== 'string') {
    meta.explain = 'No explanation provided';
    fixes.push('Set default explain');
  } else if (meta.explain.length > 280) {
    meta.explain = meta.explain.slice(0, 277) + '...';
    fixes.push('Truncated explain to 280 chars');
  }

  return envelope;
}

/**
 * 修复 data 字段
 */
function repairData(
  envelope: Envelope,
  schema: ModuleSchema,
  fixes: string[]
): Envelope {
  if (!envelope.ok) return envelope;

  const data = envelope.data as Record<string, unknown>;
  const dataSchema = schema.data;

  // 修复必需字段
  if (dataSchema.required) {
    for (const field of dataSchema.required) {
      if (!(field in data)) {
        const propSchema = dataSchema.properties?.[field];
        if (propSchema) {
          data[field] = getDefaultValue(propSchema.type);
          fixes.push(`Added missing required field: data.${field}`);
        }
      }
    }
  }

  return envelope;
}

/**
 * 修复 error 字段
 */
function repairError(envelope: Envelope, fixes: string[]): Envelope {
  if (envelope.ok) return envelope;

  const error = envelope.error as Record<string, unknown>;

  // 确保有 code
  if (typeof error.code !== 'string') {
    error.code = 'UNKNOWN_ERROR';
    fixes.push('Set default error code');
  }

  // 确保有 message
  if (typeof error.message !== 'string') {
    error.message = 'An unknown error occurred';
    fixes.push('Set default error message');
  }

  return envelope;
}

/**
 * 获取类型的默认值
 */
function getDefaultValue(type: string): unknown {
  switch (type) {
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    case 'null':
      return null;
    default:
      return null;
  }
}

/**
 * 从原始文本尝试构建 Envelope
 */
export function buildEnvelopeFromText(
  text: string,
  isSuccess: boolean = true
): Envelope {
  const meta: EnvelopeMeta = {
    confidence: 0.5,
    risk: 'low',
    explain: 'Built from raw text response',
  };

  if (isSuccess) {
    return {
      ok: true,
      meta,
      data: { raw: text },
    };
  } else {
    return {
      ok: false,
      meta: { ...meta, confidence: 0, risk: 'high' },
      error: {
        code: 'PARSE_ERROR',
        message: 'Failed to parse LLM response as JSON',
      },
    };
  }
}
