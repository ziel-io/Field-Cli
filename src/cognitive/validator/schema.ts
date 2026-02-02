/**
 * Field CLI - Schema Validator
 * JSON Schema 验证
 */

import Ajv, { type ErrorObject } from 'ajv';
import { JsonSchema, ValidationResult, ValidationError } from '../types.js';

// @ts-ignore - Ajv ESM compatibility
const AjvClass = Ajv.default || Ajv;
const ajv = new AjvClass({ allErrors: true, strict: false });

/**
 * 验证数据是否符合 JSON Schema
 */
export function validateSchema(
  data: unknown,
  schema: JsonSchema,
  schemaName: string = 'data'
): ValidationResult {
  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors: ValidationError[] = (validate.errors || []).map((err: ErrorObject) => ({
    path: err.instancePath || '/',
    message: err.message || 'Unknown validation error',
    value: err.data,
  }));

  return { valid: false, errors };
}

/**
 * 验证输入数据
 */
export function validateInput(data: unknown, inputSchema: JsonSchema): ValidationResult {
  return validateSchema(data, inputSchema, 'input');
}

/**
 * 验证输出数据 (data 字段)
 */
export function validateOutput(data: unknown, dataSchema: JsonSchema): ValidationResult {
  return validateSchema(data, dataSchema, 'data');
}

/**
 * 验证 meta 字段
 */
export function validateMeta(meta: unknown, metaSchema: JsonSchema): ValidationResult {
  return validateSchema(meta, metaSchema, 'meta');
}

/**
 * 验证错误字段
 */
export function validateError(error: unknown, errorSchema?: JsonSchema): ValidationResult {
  if (!errorSchema) {
    // 默认错误 schema
    const defaultSchema: JsonSchema = {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    };
    return validateSchema(error, defaultSchema, 'error');
  }
  return validateSchema(error, errorSchema, 'error');
}

/**
 * 获取 Schema 的必需字段
 */
export function getRequiredFields(schema: JsonSchema): string[] {
  return schema.required || [];
}

/**
 * 检查值是否符合类型
 */
export function checkType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}
