/**
 * Field CLI - Cognitive Module Loader
 * 加载和解析 Cognitive 模块（完整版）
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'yaml';

import {
  CognitiveModule,
  ModuleManifest,
  ModuleSchema,
  OverflowPolicy,
  EnumPolicy,
  Policies,
  SchemaStrictness,
  RiskRule,
} from '../types.js';

// 模块搜索路径
const MODULE_PATHS = [
  path.join(process.cwd(), 'cognitive_modules'),
  path.join(os.homedir(), '.cognitive', 'modules'),
];

// =============================================================================
// Default Policies
// =============================================================================

/**
 * 根据 schema strictness 获取默认 overflow 策略
 */
function getDefaultOverflow(strictness: SchemaStrictness): OverflowPolicy {
  switch (strictness) {
    case 'strict':
      return { enabled: false, recoverable: false, max_items: 0, require_suggested_mapping: false };
    case 'medium':
      return { enabled: true, recoverable: true, max_items: 5, require_suggested_mapping: false };
    case 'relaxed':
      return { enabled: true, recoverable: true, max_items: 20, require_suggested_mapping: false };
    default:
      return { enabled: true, recoverable: true, max_items: 5, require_suggested_mapping: false };
  }
}

/**
 * 根据 tier 获取默认 schema strictness
 */
function getDefaultStrictness(tier: string | null): SchemaStrictness {
  switch (tier) {
    case 'exec':
      return 'strict';
    case 'decision':
      return 'medium';
    case 'exploration':
      return 'relaxed';
    default:
      return 'medium';
  }
}

// =============================================================================
// Format Detection
// =============================================================================

/**
 * 检测模块格式版本
 */
function detectFormat(manifest: ModuleManifest, schema: ModuleSchema): CognitiveModule['format'] {
  // v2.2: 有 $schema 字段或 v2.2 特有配置
  if (schema.$schema?.includes('v2.2')) return 'v2.2';
  if (manifest.overflow || manifest.enums || manifest.policies) return 'v2.2';
  
  if (schema.$schema?.includes('v2.1')) return 'v2.1';
  if (schema.$schema?.includes('v2.0')) return 'v2.0';
  
  // v1: 有 tier 字段
  if (manifest.tier) return 'v1';
  
  // v0: 基础格式
  return 'v0';
}

// =============================================================================
// Module Loading
// =============================================================================

/**
 * 加载单个模块（完整版）
 */
export function loadModule(modulePath: string): CognitiveModule | null {
  try {
    const manifestPath = path.join(modulePath, 'module.yaml');
    const schemaPath = path.join(modulePath, 'schema.json');
    const promptPath = path.join(modulePath, 'prompt.md');

    // 检查必需文件
    if (!fs.existsSync(manifestPath)) {
      // 尝试 module.yml
      const altPath = path.join(modulePath, 'module.yml');
      if (!fs.existsSync(altPath)) return null;
    }

    // 读取 manifest
    const manifestFile = fs.existsSync(manifestPath) 
      ? manifestPath 
      : path.join(modulePath, 'module.yml');
    const manifestContent = fs.readFileSync(manifestFile, 'utf-8');
    const manifest = yaml.parse(manifestContent) as ModuleManifest;

    // 读取 schema
    if (!fs.existsSync(schemaPath)) return null;
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    const rawSchema = JSON.parse(schemaContent);
    
    // 兼容处理：将 output 映射到 data
    const schema: ModuleSchema = {
      $schema: rawSchema.$schema,
      input: rawSchema.input,
      data: rawSchema.output || rawSchema.data,
      meta: rawSchema.meta || {
        type: 'object',
        required: ['confidence', 'risk', 'explain'],
        properties: {
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          risk: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
          explain: { type: 'string', maxLength: 280 },
        },
      },
      error: rawSchema.error,
    };

    // 读取 prompt
    if (!fs.existsSync(promptPath)) return null;
    const prompt = fs.readFileSync(promptPath, 'utf-8');

    // 检测格式
    const format = detectFormat(manifest, schema);

    // 解析 tier 和 strictness
    const tier = manifest.tier || null;
    const schemaStrictness: SchemaStrictness = 
      manifest.schema_strictness || getDefaultStrictness(tier);

    // 构建 overflow 策略
    const overflowRaw = manifest.overflow || {};
    const defaultOverflow = getDefaultOverflow(schemaStrictness);
    const overflow: OverflowPolicy = {
      enabled: overflowRaw.enabled ?? defaultOverflow.enabled,
      recoverable: defaultOverflow.recoverable,
      max_items: overflowRaw.max_items ?? defaultOverflow.max_items,
      require_suggested_mapping: defaultOverflow.require_suggested_mapping,
    };

    // 构建 enum 策略
    const enumsRaw = manifest.enums || {};
    const enums: EnumPolicy = {
      strategy: enumsRaw.strategy || 'strict',
    };

    // 构建 policies
    const policies: Policies = manifest.policies || {};

    // 构建 risk rule
    const riskRule: RiskRule = manifest.risk_rule || 'max_changes_risk';

    return {
      name: manifest.name,
      path: modulePath,
      manifest,
      schema,
      prompt,
      format,
      
      // 解析后的策略
      tier,
      schemaStrictness,
      overflow,
      enums,
      policies,
      riskRule,
      excludes: manifest.excludes || [],
      responsibility: manifest.responsibility,
      inputSchema: schema.input,
      dataSchema: schema.data,
    };
  } catch (error) {
    console.error(`Failed to load module at ${modulePath}:`, error);
    return null;
  }
}

/**
 * 发现所有模块
 */
export function discoverModules(additionalPaths: string[] = []): CognitiveModule[] {
  const modules: CognitiveModule[] = [];
  const searchPaths = [...MODULE_PATHS, ...additionalPaths];

  for (const searchPath of searchPaths) {
    if (!fs.existsSync(searchPath)) continue;

    const entries = fs.readdirSync(searchPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const modulePath = path.join(searchPath, entry.name);
      const module = loadModule(modulePath);
      if (module) {
        modules.push(module);
      }
    }
  }

  return modules;
}

/**
 * 按名称查找模块
 */
export function findModule(name: string, additionalPaths: string[] = []): CognitiveModule | null {
  const searchPaths = [...MODULE_PATHS, ...additionalPaths];

  for (const searchPath of searchPaths) {
    const modulePath = path.join(searchPath, name);
    if (fs.existsSync(modulePath)) {
      const module = loadModule(modulePath);
      if (module) return module;
    }
  }

  return null;
}

/**
 * 获取模块搜索路径
 */
export function getModulePaths(): string[] {
  return MODULE_PATHS;
}

/**
 * 检查路径是否是有效模块
 */
export function isValidModule(modulePath: string): boolean {
  const manifestPath = path.join(modulePath, 'module.yaml');
  const altManifestPath = path.join(modulePath, 'module.yml');
  const schemaPath = path.join(modulePath, 'schema.json');
  const promptPath = path.join(modulePath, 'prompt.md');

  return (
    (fs.existsSync(manifestPath) || fs.existsSync(altManifestPath)) &&
    fs.existsSync(schemaPath) &&
    fs.existsSync(promptPath)
  );
}
