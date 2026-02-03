/**
 * Field CLI - Secure Storage
 * 
 * 加密存储 API Keys，使用 AES-256-GCM 加密
 * 密钥基于机器唯一标识生成，确保只能在本机解密
 * 
 * v2.2: 新增安全存储功能
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.field-cli');
const SECURE_FILE = path.join(CONFIG_DIR, 'credentials.enc');
const KEY_FILE = path.join(CONFIG_DIR, '.key');

// 加密算法
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * 生成机器唯一密钥
 * 基于 hostname + username + 可选的本地密钥文件
 */
function getMachineKey(): Buffer {
  const machineId = `${os.hostname()}-${os.userInfo().username}-field-cli`;
  
  // 尝试读取本地密钥文件（首次运行时生成）
  let localSalt: Buffer;
  try {
    if (fs.existsSync(KEY_FILE)) {
      localSalt = fs.readFileSync(KEY_FILE);
    } else {
      // 首次运行，生成随机 salt
      localSalt = crypto.randomBytes(SALT_LENGTH);
      ensureConfigDir();
      fs.writeFileSync(KEY_FILE, localSalt, { mode: 0o600 }); // 仅用户可读写
    }
  } catch {
    // 如果无法读写文件，使用固定 salt（降级方案）
    localSalt = Buffer.from('field-cli-default-salt-v2');
  }
  
  // 使用 PBKDF2 派生密钥
  return crypto.pbkdf2Sync(machineId, localSalt, 100000, 32, 'sha256');
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 }); // 仅用户可访问
  }
}

/**
 * 加密数据
 */
function encrypt(text: string): string {
  const key = getMachineKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // 格式: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * 解密数据
 */
function decrypt(encryptedText: string): string {
  const key = getMachineKey();
  const parts = encryptedText.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// =============================================================================
// Secure API Key Storage
// =============================================================================

interface SecureCredentials {
  version: number;
  apiKeys: Record<string, string>;  // 存储时已加密
}

/**
 * 加载安全凭证
 */
export function loadSecureCredentials(): Record<string, string> {
  ensureConfigDir();
  
  if (!fs.existsSync(SECURE_FILE)) {
    return {};
  }
  
  try {
    const encryptedData = fs.readFileSync(SECURE_FILE, 'utf-8');
    const decrypted = decrypt(encryptedData);
    const credentials: SecureCredentials = JSON.parse(decrypted);
    return credentials.apiKeys || {};
  } catch (error) {
    // 解密失败（可能是密钥变化或文件损坏）
    console.warn('Warning: Could not decrypt credentials. You may need to re-enter API keys.');
    return {};
  }
}

/**
 * 保存安全凭证
 */
export function saveSecureCredentials(apiKeys: Record<string, string>): void {
  ensureConfigDir();
  
  const credentials: SecureCredentials = {
    version: 1,
    apiKeys,
  };
  
  const encrypted = encrypt(JSON.stringify(credentials));
  fs.writeFileSync(SECURE_FILE, encrypted, { mode: 0o600 }); // 仅用户可读写
}

/**
 * 获取加密存储的 API Key
 */
export function getSecureApiKey(provider: string): string | undefined {
  const credentials = loadSecureCredentials();
  return credentials[provider];
}

/**
 * 设置加密存储的 API Key
 */
export function setSecureApiKey(provider: string, apiKey: string): void {
  const credentials = loadSecureCredentials();
  credentials[provider] = apiKey;
  saveSecureCredentials(credentials);
}

/**
 * 删除加密存储的 API Key
 */
export function deleteSecureApiKey(provider: string): void {
  const credentials = loadSecureCredentials();
  delete credentials[provider];
  saveSecureCredentials(credentials);
}

/**
 * 列出所有已存储的 Provider
 */
export function listSecureProviders(): string[] {
  const credentials = loadSecureCredentials();
  return Object.keys(credentials);
}

// =============================================================================
// Migration from plaintext config
// =============================================================================

const OLD_CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface OldConfig {
  defaultProvider?: string;
  defaultModel?: string;
  apiKeys: Record<string, string>;
}

/**
 * 从旧的明文配置迁移到加密存储
 */
export function migrateFromPlaintextConfig(): boolean {
  if (!fs.existsSync(OLD_CONFIG_FILE)) {
    return false;
  }
  
  try {
    const data = fs.readFileSync(OLD_CONFIG_FILE, 'utf-8');
    const oldConfig: OldConfig = JSON.parse(data);
    
    if (!oldConfig.apiKeys || Object.keys(oldConfig.apiKeys).length === 0) {
      return false;
    }
    
    // 检查是否已经迁移过
    const existingCredentials = loadSecureCredentials();
    if (Object.keys(existingCredentials).length > 0) {
      return false; // 已有加密凭证，不覆盖
    }
    
    // 迁移 API Keys 到加密存储
    saveSecureCredentials(oldConfig.apiKeys);
    
    // 从旧配置中删除 API Keys（保留其他设置）
    const newOldConfig = {
      defaultProvider: oldConfig.defaultProvider,
      defaultModel: oldConfig.defaultModel,
      apiKeys: {}, // 清空
      _migrated: true,
      _migratedAt: new Date().toISOString(),
    };
    
    fs.writeFileSync(OLD_CONFIG_FILE, JSON.stringify(newOldConfig, null, 2));
    
    console.log('✓ API keys migrated to secure storage');
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Hybrid Keychain Support (Optional)
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let keytarModule: any = null;
let keytarLoadAttempted = false;

/**
 * 尝试加载 keytar 模块（系统 Keychain 支持）
 * keytar 是可选依赖，需要原生编译，可能不可用
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryLoadKeytar(): Promise<any> {
  if (keytarLoadAttempted) {
    return keytarModule;
  }
  
  keytarLoadAttempted = true;
  
  try {
    // 动态导入 keytar（可选依赖）
    // @ts-expect-error keytar is optional
    keytarModule = await import('keytar');
    return keytarModule.default || keytarModule;
  } catch {
    // keytar 不可用（未安装或原生模块编译失败）
    return null;
  }
}

const KEYCHAIN_SERVICE = 'field-cli';

/**
 * 使用系统 Keychain 存储 API Key（如果可用）
 */
export async function setKeychainApiKey(provider: string, apiKey: string): Promise<boolean> {
  const keytar = await tryLoadKeytar();
  if (!keytar) {
    return false;
  }
  
  try {
    await keytar.setPassword(KEYCHAIN_SERVICE, provider, apiKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * 从系统 Keychain 获取 API Key（如果可用）
 */
export async function getKeychainApiKey(provider: string): Promise<string | null> {
  const keytar = await tryLoadKeytar();
  if (!keytar) {
    return null;
  }
  
  try {
    return await keytar.getPassword(KEYCHAIN_SERVICE, provider);
  } catch {
    return null;
  }
}

/**
 * 检查 Keychain 是否可用
 */
export async function isKeychainAvailable(): Promise<boolean> {
  const keytar = await tryLoadKeytar();
  if (!keytar) {
    return false;
  }
  
  try {
    // 测试 Keychain 访问
    await keytar.findCredentials(KEYCHAIN_SERVICE);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Unified API (Auto-select best storage method)
// =============================================================================

/**
 * 获取 API Key（优先级：环境变量 > Keychain > 加密文件）
 */
export async function getApiKeySecure(provider: string): Promise<string | undefined> {
  // 1. 环境变量优先
  const envVarMap: Record<string, string> = {
    minimax: 'MINIMAX_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    kimi: 'MOONSHOT_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    qwen: 'QWEN_API_KEY',
    gemini: 'GEMINI_API_KEY',
    together: 'TOGETHER_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    custom: 'CUSTOM_API_KEY',
  };
  
  const envVar = envVarMap[provider] || `${provider.toUpperCase()}_API_KEY`;
  const envKey = process.env[envVar];
  if (envKey) {
    return envKey;
  }
  
  // 2. 尝试 Keychain
  const keychainKey = await getKeychainApiKey(provider);
  if (keychainKey) {
    return keychainKey;
  }
  
  // 3. 加密文件
  return getSecureApiKey(provider);
}

/**
 * 设置 API Key（优先使用 Keychain，否则使用加密文件）
 */
export async function setApiKeySecure(provider: string, apiKey: string): Promise<void> {
  // 尝试使用 Keychain
  const keychainSuccess = await setKeychainApiKey(provider, apiKey);
  
  if (!keychainSuccess) {
    // Keychain 不可用，使用加密文件
    setSecureApiKey(provider, apiKey);
  }
}

/**
 * 获取存储方式信息
 */
export async function getStorageInfo(): Promise<{
  method: 'keychain' | 'encrypted-file' | 'env';
  keychainAvailable: boolean;
  secureFileExists: boolean;
}> {
  const keychainAvailable = await isKeychainAvailable();
  const secureFileExists = fs.existsSync(SECURE_FILE);
  
  return {
    method: keychainAvailable ? 'keychain' : (secureFileExists ? 'encrypted-file' : 'env'),
    keychainAvailable,
    secureFileExists,
  };
}
