/**
 * Field CLI - Advanced Version Manager
 * 
 * 比 gemini-cli-cognitive 更强的版本管理：
 * - 智能检查频率（不会每次启动都检查）
 * - 支持 stable/beta/nightly 版本通道
 * - 更新日志预览
 * - 一键更新命令
 * - Cognitive Modules 版本检查
 * - 离线检测
 * - 版本历史记录
 * 
 * v2.2: 新增版本管理功能
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';

const CONFIG_DIR = path.join(os.homedir(), '.field-cli');
const VERSION_CACHE_FILE = path.join(CONFIG_DIR, 'version-cache.json');

// 版本检查间隔（毫秒）
const CHECK_INTERVALS = {
  default: 24 * 60 * 60 * 1000,      // 24小时
  frequent: 6 * 60 * 60 * 1000,       // 6小时
  daily: 24 * 60 * 60 * 1000,         // 24小时
  weekly: 7 * 24 * 60 * 60 * 1000,    // 7天
  never: Infinity,
};

// 当前版本（从 package.json 读取）
let currentVersion: string = '0.0.0';
let versionLoaded = false;

/**
 * 获取当前版本
 */
export function getCurrentVersion(): string {
  if (versionLoaded) return currentVersion;
  versionLoaded = true;
  
  try {
    // 尝试读取 package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      currentVersion = pkg.version || '0.0.0';
    } else {
      // 尝试从模块目录读取
      const modulePackageJson = new URL('../package.json', import.meta.url);
      const pkg = JSON.parse(fs.readFileSync(modulePackageJson, 'utf-8'));
      currentVersion = pkg.version || '0.0.0';
    }
  } catch {
    currentVersion = '0.0.0';
  }
  
  return currentVersion;
}

// =============================================================================
// Version Cache
// =============================================================================

interface VersionCache {
  lastCheck: number;
  latestVersion: string | null;
  latestNightly: string | null;
  latestBeta: string | null;
  changelog: string | null;
  checkCount: number;
  updateHistory: Array<{
    from: string;
    to: string;
    date: string;
  }>;
  cognitiveModulesVersions: Record<string, string>;
}

function loadVersionCache(): VersionCache {
  try {
    if (fs.existsSync(VERSION_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(VERSION_CACHE_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  
  return {
    lastCheck: 0,
    latestVersion: null,
    latestNightly: null,
    latestBeta: null,
    changelog: null,
    checkCount: 0,
    updateHistory: [],
    cognitiveModulesVersions: {},
  };
}

function saveVersionCache(cache: VersionCache): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(VERSION_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // ignore
  }
}

// =============================================================================
// Semver Utilities
// =============================================================================

interface SemverVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

function parseSemver(version: string): SemverVersion | null {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) return null;
  
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
  };
}

function compareSemver(a: string, b: string): number {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  
  if (!va || !vb) return 0;
  
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  if (va.patch !== vb.patch) return va.patch - vb.patch;
  
  // 有预发布标签的版本比没有的低
  if (va.prerelease && !vb.prerelease) return -1;
  if (!va.prerelease && vb.prerelease) return 1;
  
  return 0;
}

function getUpdateType(from: string, to: string): 'major' | 'minor' | 'patch' | 'prerelease' | null {
  const vf = parseSemver(from);
  const vt = parseSemver(to);
  
  if (!vf || !vt) return null;
  
  if (vt.major > vf.major) return 'major';
  if (vt.minor > vf.minor) return 'minor';
  if (vt.patch > vf.patch) return 'patch';
  if (vt.prerelease !== vf.prerelease) return 'prerelease';
  
  return null;
}

// =============================================================================
// Network Utilities
// =============================================================================

async function fetchJson(url: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, timeout);
    
    https.get(url, { headers: { 'User-Agent': 'field-cli' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timeoutId);
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
    }).on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

async function isOnline(): Promise<boolean> {
  try {
    await fetchJson('https://registry.npmjs.org/field-cli-core/latest', 2000);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Version Check
// =============================================================================

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  updateType: 'major' | 'minor' | 'patch' | 'prerelease' | null;
  changelog: string | null;
  downloadUrl: string;
  publishedAt: string | null;
  channel: 'stable' | 'beta' | 'nightly';
}

/**
 * 从 npm registry 获取最新版本
 */
async function fetchLatestVersionFromNpm(channel: 'stable' | 'beta' | 'nightly' = 'stable'): Promise<{
  version: string;
  publishedAt: string | null;
} | null> {
  try {
    const tag = channel === 'stable' ? 'latest' : channel;
    const data = await fetchJson(`https://registry.npmjs.org/field-cli-core/${tag}`, 5000);
    
    return {
      version: data.version,
      publishedAt: data.time?.[data.version] || null,
    };
  } catch {
    return null;
  }
}

/**
 * 从 GitHub releases 获取更新日志
 */
async function fetchChangelogFromGitHub(version: string): Promise<string | null> {
  try {
    const data = await fetchJson(
      `https://api.github.com/repos/ziel-io/Field-Cli/releases/tags/v${version}`,
      5000
    );
    return data.body || null;
  } catch {
    return null;
  }
}

/**
 * 检查更新（智能频率控制）
 */
export async function checkForUpdates(options: {
  force?: boolean;
  channel?: 'stable' | 'beta' | 'nightly';
  checkInterval?: keyof typeof CHECK_INTERVALS;
} = {}): Promise<UpdateInfo | null> {
  const {
    force = false,
    channel = 'stable',
    checkInterval = 'default',
  } = options;
  
  const cache = loadVersionCache();
  const now = Date.now();
  const interval = CHECK_INTERVALS[checkInterval];
  
  // 检查是否需要跳过（非强制且未超过间隔）
  if (!force && cache.lastCheck > 0 && (now - cache.lastCheck) < interval) {
    // 使用缓存的版本信息
    if (cache.latestVersion) {
      const current = getCurrentVersion();
      const hasUpdate = compareSemver(cache.latestVersion, current) > 0;
      
      if (hasUpdate) {
        return {
          hasUpdate: true,
          currentVersion: current,
          latestVersion: cache.latestVersion,
          updateType: getUpdateType(current, cache.latestVersion),
          changelog: cache.changelog,
          downloadUrl: `https://www.npmjs.com/package/field-cli-core`,
          publishedAt: null,
          channel,
        };
      }
    }
    return null;
  }
  
  // 检查网络
  if (!await isOnline()) {
    return null;
  }
  
  // 从 npm 获取最新版本
  const latestInfo = await fetchLatestVersionFromNpm(channel);
  if (!latestInfo) {
    return null;
  }
  
  const current = getCurrentVersion();
  const hasUpdate = compareSemver(latestInfo.version, current) > 0;
  
  // 获取更新日志（仅当有更新时）
  let changelog: string | null = null;
  if (hasUpdate) {
    changelog = await fetchChangelogFromGitHub(latestInfo.version);
  }
  
  // 更新缓存
  cache.lastCheck = now;
  cache.latestVersion = latestInfo.version;
  cache.changelog = changelog;
  cache.checkCount++;
  saveVersionCache(cache);
  
  if (!hasUpdate) {
    return null;
  }
  
  return {
    hasUpdate: true,
    currentVersion: current,
    latestVersion: latestInfo.version,
    updateType: getUpdateType(current, latestInfo.version),
    changelog,
    downloadUrl: `https://www.npmjs.com/package/field-cli-core`,
    publishedAt: latestInfo.publishedAt,
    channel,
  };
}

// =============================================================================
// Update Execution
// =============================================================================

export interface UpdateResult {
  success: boolean;
  message: string;
  fromVersion: string;
  toVersion: string;
}

/**
 * 执行更新（返回命令，由调用者执行）
 */
export function getUpdateCommand(global = true): string {
  return global 
    ? 'npm install -g field-cli-core@latest'
    : 'npm update field-cli-core';
}

/**
 * 记录更新历史
 */
export function recordUpdate(fromVersion: string, toVersion: string): void {
  const cache = loadVersionCache();
  cache.updateHistory.push({
    from: fromVersion,
    to: toVersion,
    date: new Date().toISOString(),
  });
  
  // 只保留最近 20 条记录
  if (cache.updateHistory.length > 20) {
    cache.updateHistory = cache.updateHistory.slice(-20);
  }
  
  saveVersionCache(cache);
}

/**
 * 获取更新历史
 */
export function getUpdateHistory(): Array<{ from: string; to: string; date: string }> {
  const cache = loadVersionCache();
  return cache.updateHistory;
}

// =============================================================================
// Cognitive Modules Version Check
// =============================================================================

/**
 * 检查 Cognitive Module 版本
 */
export async function checkCognitiveModuleVersion(moduleName: string): Promise<{
  current: string | null;
  latest: string | null;
  hasUpdate: boolean;
} | null> {
  // TODO: 实现从 GitHub 或其他源获取 module 版本
  // 目前返回 null 表示不支持
  return null;
}

/**
 * 缓存 Cognitive Module 版本
 */
export function setCognitiveModuleVersion(moduleName: string, version: string): void {
  const cache = loadVersionCache();
  cache.cognitiveModulesVersions[moduleName] = version;
  saveVersionCache(cache);
}

// =============================================================================
// Version Info Display
// =============================================================================

/**
 * 获取版本信息（用于 /version 命令）
 */
export async function getVersionInfo(): Promise<{
  current: string;
  latest: string | null;
  hasUpdate: boolean;
  updateType: string | null;
  lastCheck: string | null;
  checkCount: number;
  updateHistory: Array<{ from: string; to: string; date: string }>;
  channel: string;
}> {
  const cache = loadVersionCache();
  const current = getCurrentVersion();
  
  // 尝试获取最新版本（使用缓存）
  let latest = cache.latestVersion;
  let hasUpdate = false;
  let updateType: string | null = null;
  
  if (latest) {
    hasUpdate = compareSemver(latest, current) > 0;
    updateType = hasUpdate ? getUpdateType(current, latest) : null;
  }
  
  return {
    current,
    latest,
    hasUpdate,
    updateType,
    lastCheck: cache.lastCheck > 0 ? new Date(cache.lastCheck).toISOString() : null,
    checkCount: cache.checkCount,
    updateHistory: cache.updateHistory.slice(-5), // 最近 5 条
    channel: 'stable',
  };
}

/**
 * 格式化更新提示（带颜色的 banner）
 */
export function formatUpdateBanner(info: UpdateInfo): string {
  const typeEmoji = {
    major: '🚀',
    minor: '✨',
    patch: '🔧',
    prerelease: '🧪',
  };
  
  const emoji = info.updateType ? typeEmoji[info.updateType] : '📦';
  const typeLabel = info.updateType ? ` (${info.updateType})` : '';
  
  const lines = [
    '╭─────────────────────────────────────────────────────────────╮',
    '│                                                             │',
    `│  ${emoji} Update available!${typeLabel.padEnd(39)}│`,
    `│     ${info.currentVersion} → ${info.latestVersion}`.padEnd(62) + '│',
    '│                                                             │',
    '│  Run: npm install -g field-cli-core@latest                  │',
    '│                                                             │',
    '╰─────────────────────────────────────────────────────────────╯',
  ];
  
  return lines.join('\n');
}

/**
 * 简短更新提示
 */
export function formatUpdateNotice(info: UpdateInfo): string {
  return `📦 Update: ${info.currentVersion} → ${info.latestVersion}. Run: npm i -g field-cli-core@latest`;
}

// =============================================================================
// Auto-check on Startup (non-blocking)
// =============================================================================

let startupCheckPromise: Promise<UpdateInfo | null> | null = null;

/**
 * 启动时异步检查更新（非阻塞）
 */
export function startBackgroundUpdateCheck(): void {
  startupCheckPromise = checkForUpdates({ checkInterval: 'daily' }).catch(() => null);
}

/**
 * 获取启动检查结果（如果已完成）
 */
export async function getStartupCheckResult(): Promise<UpdateInfo | null> {
  if (!startupCheckPromise) return null;
  return startupCheckPromise;
}

// =============================================================================
// Export All
// =============================================================================

export {
  CHECK_INTERVALS,
  compareSemver,
  parseSemver,
};
