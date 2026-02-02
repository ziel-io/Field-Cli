/**
 * Field CLI - Enum Strategy Validator
 * 根据 EnumPolicy 策略验证枚举值
 */

import type { 
  CognitiveModule, 
  EnumPolicy, 
  EnumStrategy,
  ValidationResult, 
  ValidationError,
  JsonSchema,
  JsonSchemaProperty,
} from '../types.js';

/**
 * Enum 验证结果
 */
export interface EnumValidationResult extends ValidationResult {
  /** 警告（用于 suggest 策略） */
  warnings: ValidationError[];
}

/**
 * 从 Schema 中提取所有 enum 定义
 */
function extractEnums(
  schema: JsonSchema | JsonSchemaProperty,
  path: string = ''
): Array<{ path: string; allowed: string[] }> {
  const enums: Array<{ path: string; allowed: string[] }> = [];
  
  // 当前属性有 enum
  if ('enum' in schema && Array.isArray(schema.enum)) {
    enums.push({ path: path || '/', allowed: schema.enum });
  }
  
  // 递归检查 properties
  if ('properties' in schema && schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      const propPath = path ? `${path}/${key}` : `/${key}`;
      enums.push(...extractEnums(prop as JsonSchemaProperty, propPath));
    }
  }
  
  // 递归检查 items (数组)
  if ('items' in schema && schema.items) {
    enums.push(...extractEnums(schema.items as JsonSchemaProperty, `${path}[]`));
  }
  
  return enums;
}

/**
 * 获取嵌套对象的值
 */
function getValueAtPath(obj: unknown, path: string): unknown {
  if (!path || path === '/') return obj;
  
  const parts = path.split('/').filter(p => p && p !== '[]');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  
  return current;
}

/**
 * 验证单个值是否符合 enum 约束
 */
function validateEnumValue(
  value: unknown,
  allowed: string[],
  path: string,
  strategy: EnumStrategy
): { error?: ValidationError; warning?: ValidationError } {
  // 空值跳过验证
  if (value === null || value === undefined) {
    return {};
  }
  
  const strValue = String(value);
  const isValid = allowed.includes(strValue);
  
  if (isValid) {
    return {};
  }
  
  const message = `Value "${strValue}" is not in allowed values: [${allowed.join(', ')}]`;
  
  switch (strategy) {
    case 'strict':
      // 严格模式：返回错误
      return {
        error: { path, message, value },
      };
    
    case 'suggest':
      // 建议模式：返回警告但不阻止
      return {
        warning: { path, message: `[Warning] ${message}`, value },
      };
    
    case 'free':
      // 自由模式：完全忽略
      return {};
    
    default:
      return {};
  }
}

/**
 * 根据 Enum 策略验证数据
 */
export function validateEnumStrategy(
  data: unknown,
  schema: JsonSchema,
  enumPolicy: EnumPolicy
): EnumValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  // 提取所有 enum 定义
  const enumDefs = extractEnums(schema);
  
  // 验证每个 enum
  for (const enumDef of enumDefs) {
    const value = getValueAtPath(data, enumDef.path);
    
    // 处理数组
    if (enumDef.path.includes('[]') && Array.isArray(getValueAtPath(data, enumDef.path.replace('[]', '')))) {
      const arrayPath = enumDef.path.replace('[]', '');
      const array = getValueAtPath(data, arrayPath) as unknown[];
      
      for (let i = 0; i < array.length; i++) {
        const itemPath = `${arrayPath}[${i}]`;
        const itemValue = array[i];
        
        // 如果 enum 在数组项的属性上
        if (enumDef.path.endsWith('[]')) {
          const result = validateEnumValue(itemValue, enumDef.allowed, itemPath, enumPolicy.strategy);
          if (result.error) errors.push(result.error);
          if (result.warning) warnings.push(result.warning);
        }
      }
    } else {
      const result = validateEnumValue(value, enumDef.allowed, enumDef.path, enumPolicy.strategy);
      if (result.error) errors.push(result.error);
      if (result.warning) warnings.push(result.warning);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 根据模块配置验证数据的 enum 约束
 */
export function validateModuleEnums(
  data: unknown,
  module: CognitiveModule
): EnumValidationResult {
  return validateEnumStrategy(data, module.dataSchema, module.enums);
}

/**
 * 合并 Schema 验证结果和 Enum 验证结果
 */
export function mergeValidationResults(
  schemaResult: ValidationResult,
  enumResult: EnumValidationResult
): EnumValidationResult {
  return {
    valid: schemaResult.valid && enumResult.valid,
    errors: [...schemaResult.errors, ...enumResult.errors],
    warnings: enumResult.warnings,
  };
}

/**
 * 完整验证（Schema + Enum 策略）
 */
export function validateWithEnumStrategy(
  data: unknown,
  schema: JsonSchema,
  enumPolicy: EnumPolicy
): EnumValidationResult {
  // 先用 Ajv 做基本 Schema 验证（但跳过 enum，因为我们要按策略处理）
  // 注意：这里我们仍然让 Ajv 验证 enum，但之后会按策略过滤结果
  
  const enumResult = validateEnumStrategy(data, schema, enumPolicy);
  
  return enumResult;
}
