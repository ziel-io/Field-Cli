/**
 * Field CLI - Envelope Validator
 * 验证 Cognitive 响应信封格式
 */

import {
  Envelope,
  EnvelopeMeta,
  ModuleSchema,
  ValidationResult,
  ValidationError,
  RiskLevel,
} from '../types.js';
import { validateMeta, validateOutput, validateError } from './schema.js';

const VALID_RISK_LEVELS: RiskLevel[] = ['none', 'low', 'medium', 'high'];

/**
 * 检测是否是 Envelope 格式
 */
export function isEnvelope(data: unknown): data is Envelope {
  if (typeof data !== 'object' || data === null) return false;
  
  const obj = data as Record<string, unknown>;
  
  // 必须有 ok 字段
  if (typeof obj.ok !== 'boolean') return false;
  
  // 必须有 meta 字段
  if (typeof obj.meta !== 'object' || obj.meta === null) return false;
  
  // 成功时必须有 data，失败时必须有 error
  if (obj.ok) {
    return 'data' in obj;
  } else {
    return 'error' in obj;
  }
}

/**
 * 验证 meta 字段基本结构
 */
function validateMetaBasic(meta: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  
  if (typeof meta !== 'object' || meta === null) {
    return {
      valid: false,
      errors: [{ path: '/meta', message: 'meta must be an object' }],
    };
  }

  const m = meta as Record<string, unknown>;

  // confidence 必须是 0-1 之间的数字
  if (typeof m.confidence !== 'number') {
    errors.push({ path: '/meta/confidence', message: 'confidence must be a number' });
  } else if (m.confidence < 0 || m.confidence > 1) {
    errors.push({ path: '/meta/confidence', message: 'confidence must be between 0 and 1', value: m.confidence });
  }

  // risk 必须是有效的风险等级
  if (typeof m.risk !== 'string') {
    errors.push({ path: '/meta/risk', message: 'risk must be a string' });
  } else if (!VALID_RISK_LEVELS.includes(m.risk as RiskLevel)) {
    errors.push({ path: '/meta/risk', message: `risk must be one of: ${VALID_RISK_LEVELS.join(', ')}`, value: m.risk });
  }

  // explain 必须是字符串
  if (typeof m.explain !== 'string') {
    errors.push({ path: '/meta/explain', message: 'explain must be a string' });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 完整验证 Envelope
 */
export function validateEnvelope(
  data: unknown,
  schema: ModuleSchema
): ValidationResult {
  const errors: ValidationError[] = [];

  // 基本结构检查
  if (!isEnvelope(data)) {
    return {
      valid: false,
      errors: [{ path: '/', message: 'Invalid envelope structure. Must have ok, meta, and data/error fields.' }],
    };
  }

  // 验证 meta 基本结构
  const metaBasicResult = validateMetaBasic(data.meta);
  errors.push(...metaBasicResult.errors);

  // 验证 meta schema
  const metaResult = validateMeta(data.meta, schema.meta);
  errors.push(...metaResult.errors);

  // 验证 data 或 error
  if (data.ok) {
    const dataResult = validateOutput(data.data, schema.data);
    errors.push(...dataResult.errors);
  } else {
    const errorResult = validateError(data.error, schema.error);
    errors.push(...errorResult.errors);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 尝试从原始文本解析 Envelope
 */
export function parseEnvelope(text: string): Envelope | null {
  // 移除可能的 markdown 代码块
  let cleaned = text.trim();
  
  // 移除 ```json ... ``` 包装
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim();
  }

  // 尝试找到 JSON 对象
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (isEnvelope(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 聚合多个结果的风险等级
 */
export function aggregateRisk(risks: RiskLevel[]): RiskLevel {
  if (risks.includes('high')) return 'high';
  if (risks.includes('medium')) return 'medium';
  if (risks.includes('low')) return 'low';
  return 'none';
}
