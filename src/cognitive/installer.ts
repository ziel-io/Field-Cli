/**
 * Field CLI - Module Installer
 * 安装、更新、删除 Cognitive 模块
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

import { InstalledModule, InstallManifest } from './types.js';
import { isValidModule } from './loader/index.js';

const GLOBAL_MODULES_DIR = path.join(os.homedir(), '.cognitive', 'modules');
const MANIFEST_FILE = path.join(os.homedir(), '.cognitive', 'manifest.json');

/**
 * 确保目录存在
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 加载安装清单
 */
export function loadManifest(): InstallManifest {
  ensureDir(path.dirname(MANIFEST_FILE));
  
  if (fs.existsSync(MANIFEST_FILE)) {
    try {
      const data = fs.readFileSync(MANIFEST_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return { version: '1.0', modules: {} };
    }
  }
  
  return { version: '1.0', modules: {} };
}

/**
 * 保存安装清单
 */
function saveManifest(manifest: InstallManifest): void {
  ensureDir(path.dirname(MANIFEST_FILE));
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
}

/**
 * 解析 GitHub URL
 */
function parseGitHubUrl(url: string): { owner: string; repo: string; tag?: string } | null {
  // 支持格式:
  // - github:user/repo
  // - github:user/repo#tag
  // - user/repo
  // - https://github.com/user/repo
  
  let cleaned = url.replace(/^github:/, '').replace(/^https?:\/\/github\.com\//, '');
  
  let tag: string | undefined;
  if (cleaned.includes('#')) {
    const [path, tagPart] = cleaned.split('#');
    cleaned = path;
    tag = tagPart;
  }
  
  const parts = cleaned.split('/');
  if (parts.length < 2) return null;
  
  return {
    owner: parts[0],
    repo: parts[1],
    tag,
  };
}

/**
 * 从 GitHub 安装模块
 */
export async function installModule(
  source: string,
  moduleName: string,
  tag?: string
): Promise<{ success: boolean; message: string }> {
  const parsed = parseGitHubUrl(source);
  if (!parsed) {
    return { success: false, message: 'Invalid GitHub URL format' };
  }

  const effectiveTag = tag || parsed.tag || 'main';
  const tempDir = path.join(os.tmpdir(), `cognitive-install-${Date.now()}`);
  
  try {
    ensureDir(GLOBAL_MODULES_DIR);
    ensureDir(tempDir);

    // 克隆仓库
    const cloneUrl = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
    execSync(`git clone --depth 1 --branch ${effectiveTag} ${cloneUrl} ${tempDir}`, {
      stdio: 'pipe',
    });

    // 查找模块
    const modulePath = path.join(tempDir, moduleName);
    const altModulePath = path.join(tempDir, 'modules', moduleName);
    
    let sourceModulePath: string | null = null;
    if (isValidModule(modulePath)) {
      sourceModulePath = modulePath;
    } else if (isValidModule(altModulePath)) {
      sourceModulePath = altModulePath;
    } else {
      // 尝试在根目录查找
      const entries = fs.readdirSync(tempDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const checkPath = path.join(tempDir, entry.name);
          if (isValidModule(checkPath) && entry.name === moduleName) {
            sourceModulePath = checkPath;
            break;
          }
        }
      }
    }

    if (!sourceModulePath) {
      return { success: false, message: `Module '${moduleName}' not found in repository` };
    }

    // 复制到全局目录
    const destPath = path.join(GLOBAL_MODULES_DIR, moduleName);
    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { recursive: true });
    }
    
    fs.cpSync(sourceModulePath, destPath, { recursive: true });

    // 读取模块信息
    const manifestPath = fs.existsSync(path.join(destPath, 'module.yaml'))
      ? path.join(destPath, 'module.yaml')
      : path.join(destPath, 'module.yml');
    
    // 简单读取版本
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const versionMatch = manifestContent.match(/version:\s*['"]?([^'"\n]+)/);
    const version = versionMatch ? versionMatch[1] : '0.0.0';

    // 更新清单
    const manifest = loadManifest();
    manifest.modules[moduleName] = {
      name: moduleName,
      version,
      source: `github:${parsed.owner}/${parsed.repo}`,
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      locked: false,
      path: destPath,
    };
    saveManifest(manifest);

    // 清理临时目录
    fs.rmSync(tempDir, { recursive: true });

    return { success: true, message: `Successfully installed ${moduleName} v${version}` };
  } catch (error) {
    // 清理
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Installation failed: ${message}` };
  }
}

/**
 * 删除模块
 */
export function removeModule(moduleName: string): { success: boolean; message: string } {
  const manifest = loadManifest();
  const moduleInfo = manifest.modules[moduleName];
  
  if (!moduleInfo) {
    return { success: false, message: `Module '${moduleName}' is not installed` };
  }

  try {
    if (fs.existsSync(moduleInfo.path)) {
      fs.rmSync(moduleInfo.path, { recursive: true });
    }

    delete manifest.modules[moduleName];
    saveManifest(manifest);

    return { success: true, message: `Successfully removed ${moduleName}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Removal failed: ${message}` };
  }
}

/**
 * 更新模块
 */
export async function updateModule(
  moduleName: string
): Promise<{ success: boolean; message: string }> {
  const manifest = loadManifest();
  const moduleInfo = manifest.modules[moduleName];

  if (!moduleInfo) {
    return { success: false, message: `Module '${moduleName}' is not installed` };
  }

  if (moduleInfo.locked) {
    return { success: false, message: `Module '${moduleName}' is locked. Use /cog unlock first.` };
  }

  // 重新安装
  return installModule(moduleInfo.source, moduleName);
}

/**
 * 锁定模块版本
 */
export function lockModule(moduleName: string): { success: boolean; message: string } {
  const manifest = loadManifest();
  
  if (!manifest.modules[moduleName]) {
    return { success: false, message: `Module '${moduleName}' is not installed` };
  }

  manifest.modules[moduleName].locked = true;
  saveManifest(manifest);

  return { success: true, message: `Locked ${moduleName} at version ${manifest.modules[moduleName].version}` };
}

/**
 * 解锁模块
 */
export function unlockModule(moduleName: string): { success: boolean; message: string } {
  const manifest = loadManifest();
  
  if (!manifest.modules[moduleName]) {
    return { success: false, message: `Module '${moduleName}' is not installed` };
  }

  manifest.modules[moduleName].locked = false;
  saveManifest(manifest);

  return { success: true, message: `Unlocked ${moduleName}` };
}

/**
 * 列出已安装模块
 */
export function listInstalledModules(): InstalledModule[] {
  const manifest = loadManifest();
  return Object.values(manifest.modules);
}

/**
 * 检查模块是否已锁定
 */
export function isLocked(moduleName: string): boolean {
  const manifest = loadManifest();
  return manifest.modules[moduleName]?.locked ?? false;
}

/**
 * 获取可用版本 (从 GitHub releases)
 */
export async function listVersions(source: string): Promise<string[]> {
  const parsed = parseGitHubUrl(source);
  if (!parsed) return [];

  try {
    const response = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/tags`
    );
    
    if (!response.ok) return [];
    
    const tags = await response.json() as Array<{ name: string }>;
    return tags.map((t) => t.name);
  } catch {
    return [];
  }
}
