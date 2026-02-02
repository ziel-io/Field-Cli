/**
 * Field CLI - Configuration Storage
 * 存储 API keys 和用户配置
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.field-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface Config {
  defaultProvider?: string;
  defaultModel?: string;
  apiKeys: Record<string, string>;
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): Config {
  ensureConfigDir();
  
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
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getApiKey(provider: string): string | undefined {
  const config = loadConfig();
  
  // 优先从环境变量读取
  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  if (envKey) return envKey;
  
  // 从配置文件读取
  return config.apiKeys[provider];
}

export function setApiKey(provider: string, apiKey: string): void {
  const config = loadConfig();
  config.apiKeys[provider] = apiKey;
  saveConfig(config);
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
