/**
 * Field CLI - Configuration Storage
 * 
 * v2.2: 使用加密存储 API Keys
 * - API Keys 使用 AES-256-GCM 加密存储
 * - 支持系统 Keychain（如果可用）
 * - 向后兼容旧的明文配置（自动迁移）
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getSecureApiKey,
  setSecureApiKey,
  migrateFromPlaintextConfig,
  getStorageInfo,
  listSecureProviders,
} from './secure-storage.js';

const CONFIG_DIR = path.join(os.homedir(), '.field-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface Config {
  defaultProvider?: string;
  defaultModel?: string;
  apiKeys: Record<string, string>;  // 保留用于向后兼容，但不再存储敏感数据
  _migrated?: boolean;
  _migratedAt?: string;
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

// 初始化时尝试迁移旧配置
let migrationAttempted = false;
function tryMigration(): void {
  if (migrationAttempted) return;
  migrationAttempted = true;
  migrateFromPlaintextConfig();
}

export function loadConfig(): Config {
  ensureConfigDir();
  tryMigration();
  
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return { apiKeys: {} };
    }
  }
  
  return { apiKeys: {} };
}

export function saveConfig(config: Config): void {
  ensureConfigDir();
  // 不再在 config.json 中存储 API Keys
  const safeConfig = {
    defaultProvider: config.defaultProvider,
    defaultModel: config.defaultModel,
    apiKeys: {}, // 清空，API Keys 存储在加密文件中
    _migrated: config._migrated,
    _migratedAt: config._migratedAt,
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(safeConfig, null, 2));
}

/**
 * 获取 API Key
 * 优先级：环境变量 > 加密存储
 */
export function getApiKey(provider: string): string | undefined {
  tryMigration();
  
  // 环境变量映射
  const envVarMap: Record<string, string> = {
    minimax: 'MINIMAX_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    kimi: 'MOONSHOT_API_KEY',
    moonshot: 'MOONSHOT_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    qwen: 'QWEN_API_KEY',
    gemini: 'GEMINI_API_KEY',
    together: 'TOGETHER_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    custom: 'CUSTOM_API_KEY',
  };
  
  // 1. 优先从环境变量读取
  const envVar = envVarMap[provider] || `${provider.toUpperCase()}_API_KEY`;
  const envKey = process.env[envVar];
  if (envKey) return envKey;
  
  // 2. 从加密存储读取
  return getSecureApiKey(provider);
}

/**
 * 设置 API Key（加密存储）
 */
export function setApiKey(provider: string, apiKey: string): void {
  setSecureApiKey(provider, apiKey);
}

export function setDefaultProvider(provider: string, model?: string): void {
  const config = loadConfig();
  config.defaultProvider = provider;
  if (model) config.defaultModel = model;
  saveConfig(config);
}

export function getDefaultProvider(): { provider?: string; model?: string } {
  const config = loadConfig();
  return {
    provider: config.defaultProvider,
    model: config.defaultModel,
  };
}

/**
 * 获取存储信息（用于显示安全状态）
 */
export async function getSecurityInfo(): Promise<{
  method: string;
  keychainAvailable: boolean;
  providers: string[];
}> {
  const info = await getStorageInfo();
  const providers = listSecureProviders();
  
  return {
    method: info.keychainAvailable ? 'System Keychain' : 'AES-256-GCM Encrypted File',
    keychainAvailable: info.keychainAvailable,
    providers,
  };
}
