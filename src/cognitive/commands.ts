/**
 * Field CLI - Cognitive Commands
 * /cog 完整命令实现
 */

import chalk from 'chalk';

import { discoverModules, findModule, getModulePaths } from './loader/index.js';
import { validateInput, validateOutput, validateMeta } from './validator/schema.js';
import { validateEnvelope } from './validator/envelope.js';
import { executeModule } from './runtime/executor.js';
import { parseSubagentCalls, analyzeDependencies, topologicalSort } from './runtime/subagent.js';
import {
  installModule,
  removeModule,
  updateModule,
  lockModule,
  unlockModule,
  listInstalledModules,
  listVersions,
} from './installer.js';
import { CognitiveModule } from './types.js';
import { LLMClient } from '../llm.js';
import { getProvider, Provider } from '../providers.js';
import { getApiKey } from '../config.js';

// 存储当前 client 和 provider 的引用
let _currentClient: LLMClient | null = null;
let _currentProvider: Provider | null = null;

/**
 * 设置当前 LLM client（从 index.ts 调用）
 */
export function setCurrentClient(client: LLMClient | null, provider: Provider | null): void {
  _currentClient = client;
  _currentProvider = provider;
}

/**
 * 处理 /cog 命令
 */
export async function handleCogCommand(args: string[]): Promise<void> {
  const subCommand = args[0] || 'help';

  switch (subCommand) {
    case 'list':
      await cmdList();
      break;
    case 'info':
      await cmdInfo(args[1]);
      break;
    case 'validate':
      await cmdValidate(args[1]);
      break;
    case 'run':
      await cmdRun(args.slice(1));
      break;
    case 'deps':
      await cmdDeps(args[1]);
      break;
    case 'install':
      await cmdInstall(args.slice(1));
      break;
    case 'remove':
      await cmdRemove(args[1]);
      break;
    case 'update':
      await cmdUpdate(args[1]);
      break;
    case 'lock':
      await cmdLock(args[1]);
      break;
    case 'unlock':
      await cmdUnlock(args[1]);
      break;
    case 'versions':
      await cmdVersions(args[1]);
      break;
    case 'help':
    default:
      showHelp();
  }
}

/**
 * 显示帮助
 */
function showHelp(): void {
  console.log(chalk.cyan(`
┌─────────────────────────────────────────────────────────┐
│             Cognitive Module Commands                   │
├─────────────────────────────────────────────────────────┤
│  /cog list              List all available modules      │
│  /cog info <name>       Show module details             │
│  /cog validate <name>   Validate module structure       │
│  /cog run <name> [json] Execute a module manually       │
│  /cog deps <name>       Show module dependencies        │
│  /cog install <url> -m <name>  Install from GitHub      │
│  /cog remove <name>     Remove a module                 │
│  /cog update <name>     Update a module                 │
│  /cog lock <name>       Lock module version             │
│  /cog unlock <name>     Unlock module version           │
│  /cog versions <url>    List available versions         │
│  /cog help              Show this help                  │
├─────────────────────────────────────────────────────────┤
│  Module directories:                                    │
│    Project: ./cognitive_modules/                        │
│    Global:  ~/.cognitive/modules/                       │
├─────────────────────────────────────────────────────────┤
│  Examples:                                              │
│    /cog install github:ziel-io/cognitive-modules \\      │
│        -m code-reviewer                                 │
│    /cog run code-reviewer {"code": "...", "lang": "js"} │
└─────────────────────────────────────────────────────────┘
`));
}

/**
 * /cog run <name> [json] - 手动执行模块
 */
async function cmdRun(args: string[]): Promise<void> {
  const name = args[0];
  const inputJson = args.slice(1).join(' ');

  if (!name) {
    console.log(chalk.red('Usage: /cog run <module-name> [input-json]'));
    return;
  }

  const module = findModule(name);
  if (!module) {
    console.log(chalk.red(`Module '${name}' not found.`));
    return;
  }

  if (!_currentClient || !_currentProvider) {
    console.log(chalk.red('No LLM provider configured. Please configure a provider first.'));
    return;
  }

  // 解析输入
  let input: unknown = {};
  if (inputJson) {
    try {
      input = JSON.parse(inputJson);
    } catch (e) {
      console.log(chalk.red(`Invalid JSON input: ${e instanceof Error ? e.message : e}`));
      return;
    }
  }

  console.log(chalk.cyan(`\n📦 Executing module: ${name}`));
  console.log(chalk.gray(`Input: ${JSON.stringify(input, null, 2)}`));
  console.log(chalk.gray('─'.repeat(40)));

  try {
    const startTime = Date.now();
    
    const result = await executeModule(module, _currentClient, _currentProvider.name, {
      input,
      stream: true,
      onChunk: (chunk, done) => {
        if (!done) process.stdout.write(chunk);
      },
    });

    const elapsed = Date.now() - startTime;

    console.log('\n');
    console.log(chalk.gray('─'.repeat(40)));
    
    if (result.success) {
      console.log(chalk.green(`✓ Module executed successfully (${elapsed}ms)`));
      console.log(chalk.white('\nResult:'));
      console.log(chalk.gray(JSON.stringify(result.envelope, null, 2)));
    } else {
      console.log(chalk.red(`✗ Module execution failed (${elapsed}ms)`));
      console.log(chalk.red(JSON.stringify(result.envelope, null, 2)));
    }

    if (result.repaired) {
      console.log(chalk.yellow('\n⚠️  Response was auto-repaired'));
    }
  } catch (error) {
    console.log(chalk.red(`\nExecution error: ${error instanceof Error ? error.message : error}`));
  }
}

/**
 * /cog deps <name> - 显示模块依赖
 */
async function cmdDeps(name: string): Promise<void> {
  if (!name) {
    console.log(chalk.red('Usage: /cog deps <module-name>'));
    return;
  }

  const module = findModule(name);
  if (!module) {
    console.log(chalk.red(`Module '${name}' not found.`));
    return;
  }

  console.log(chalk.cyan(`\n── Module Dependencies: ${name} ──\n`));

  // 解析 @call 指令
  const calls = parseSubagentCalls(module.prompt);
  
  if (calls.length === 0) {
    console.log(chalk.gray('  No subagent calls (@call) found in this module.'));
    console.log();
    return;
  }

  console.log(chalk.white(`  Found ${calls.length} subagent calls:\n`));

  for (const call of calls) {
    const depModule = findModule(call.moduleName);
    const status = depModule ? chalk.green('✓') : chalk.red('✗');
    const context = call.context === 'fork' ? chalk.yellow(' [fork]') : '';
    
    console.log(`  ${status} @call:${call.moduleName}${context}`);
    if (!depModule) {
      console.log(chalk.red(`      Module not found!`));
    } else {
      console.log(chalk.gray(`      ${depModule.manifest.responsibility}`));
    }
  }

  // 分析依赖关系
  const nodes = analyzeDependencies(module.prompt, calls);
  const batches = topologicalSort(nodes);

  console.log(chalk.white('\n  Execution order:'));
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const names = batch.map(c => c.moduleName).join(', ');
    const parallel = batch.length > 1 ? chalk.blue(' (parallel)') : '';
    console.log(chalk.gray(`    ${i + 1}. ${names}${parallel}`));
  }

  console.log();
}

/**
 * /cog list - 列出所有模块
 */
async function cmdList(): Promise<void> {
  const modules = discoverModules();
  const installed = listInstalledModules();

  if (modules.length === 0) {
    console.log(chalk.yellow('No cognitive modules found.'));
    console.log(chalk.gray('Install modules with: /cog install github:user/repo -m module-name'));
    return;
  }

  console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│             Cognitive Modules                           │'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────────┤'));

  for (const module of modules) {
    const installedInfo = installed.find((i) => i.name === module.name);
    const lockIcon = installedInfo?.locked ? '🔒' : '';
    const tierColor = getTierColor(module.manifest?.tier || '');
    
    const name = (module.name || 'unknown').padEnd(20);
    const tier = (module.manifest?.tier || '-').padEnd(12);
    const version = `v${module.manifest?.version || '?'}`.padEnd(10);
    const lock = (lockIcon || '').padEnd(3);
    
    console.log(
      chalk.cyan('│ ') +
      chalk.white(name) +
      tierColor(tier) +
      chalk.gray(version) +
      lock +
      chalk.cyan('│')
    );
  }

  console.log(chalk.cyan('└─────────────────────────────────────────────────────────┘'));
  console.log(chalk.gray(`\nTotal: ${modules.length} modules`));
}

/**
 * /cog info <name> - 显示模块详情
 */
async function cmdInfo(name: string): Promise<void> {
  if (!name) {
    console.log(chalk.red('Usage: /cog info <module-name>'));
    return;
  }

  const module = findModule(name);
  if (!module) {
    console.log(chalk.red(`Module '${name}' not found.`));
    return;
  }

  const { manifest, schema, format } = module;
  const tierColor = getTierColor(manifest.tier);

  console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│             Module Information                          │'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────────┤'));
  console.log(chalk.cyan('│ ') + chalk.white('Name:        ') + chalk.green(manifest.name).padEnd(42) + chalk.cyan('│'));
  console.log(chalk.cyan('│ ') + chalk.white('Version:     ') + chalk.yellow(manifest.version).padEnd(42) + chalk.cyan('│'));
  console.log(chalk.cyan('│ ') + chalk.white('Tier:        ') + tierColor(manifest.tier).padEnd(42) + chalk.cyan('│'));
  console.log(chalk.cyan('│ ') + chalk.white('Format:      ') + chalk.gray(format).padEnd(42) + chalk.cyan('│'));
  console.log(chalk.cyan('│ ') + chalk.white('Strictness:  ') + chalk.gray(manifest.schema_strictness || 'medium').padEnd(42) + chalk.cyan('│'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────────┤'));
  console.log(chalk.cyan('│ ') + chalk.white('Responsibility:') + chalk.cyan('                                        │'));
  console.log(chalk.cyan('│   ') + chalk.gray(truncate(manifest.responsibility, 52)) + chalk.cyan(' │'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────────┤'));
  console.log(chalk.cyan('│ ') + chalk.white('Input Schema:') + chalk.cyan('                                          │'));
  
  const inputFields = schema.input.required || Object.keys(schema.input.properties || {});
  for (const field of inputFields.slice(0, 3)) {
    console.log(chalk.cyan('│   ') + chalk.gray(`- ${field}`).padEnd(54) + chalk.cyan('│'));
  }
  if (inputFields.length > 3) {
    console.log(chalk.cyan('│   ') + chalk.gray(`... and ${inputFields.length - 3} more`).padEnd(54) + chalk.cyan('│'));
  }

  console.log(chalk.cyan('├─────────────────────────────────────────────────────────┤'));
  console.log(chalk.cyan('│ ') + chalk.white('Excludes:') + chalk.cyan('                                              │'));
  
  if (manifest.excludes && manifest.excludes.length > 0) {
    for (const exclude of manifest.excludes.slice(0, 3)) {
      console.log(chalk.cyan('│   ') + chalk.red(`✗ ${exclude}`).padEnd(54) + chalk.cyan('│'));
    }
  } else {
    console.log(chalk.cyan('│   ') + chalk.gray('None').padEnd(54) + chalk.cyan('│'));
  }

  console.log(chalk.cyan('└─────────────────────────────────────────────────────────┘'));
}

/**
 * /cog validate <name> - 验证模块
 */
async function cmdValidate(name: string): Promise<void> {
  if (!name) {
    console.log(chalk.red('Usage: /cog validate <module-name>'));
    return;
  }

  const module = findModule(name);
  if (!module) {
    console.log(chalk.red(`Module '${name}' not found.`));
    return;
  }

  console.log(chalk.cyan(`\nValidating module: ${name}`));
  console.log(chalk.gray('─'.repeat(40)));

  let allValid = true;

  // 检查 manifest
  console.log(chalk.white('Manifest (module.yaml):'));
  if (module.manifest.name && module.manifest.version && module.manifest.tier) {
    console.log(chalk.green('  ✓ Required fields present'));
  } else {
    console.log(chalk.red('  ✗ Missing required fields'));
    allValid = false;
  }

  // 检查 schema
  console.log(chalk.white('\nSchema (schema.json):'));
  if (module.schema.input && module.schema.meta && module.schema.data) {
    console.log(chalk.green('  ✓ Input schema defined'));
    console.log(chalk.green('  ✓ Meta schema defined'));
    console.log(chalk.green('  ✓ Data schema defined'));
  } else {
    console.log(chalk.red('  ✗ Missing schema definitions'));
    allValid = false;
  }

  // 检查 prompt
  console.log(chalk.white('\nPrompt (prompt.md):'));
  if (module.prompt && module.prompt.length > 10) {
    console.log(chalk.green(`  ✓ Prompt defined (${module.prompt.length} chars)`));
  } else {
    console.log(chalk.red('  ✗ Prompt missing or too short'));
    allValid = false;
  }

  // 检查 subagent 调用
  const callMatches = module.prompt.match(/@call:/g);
  if (callMatches) {
    console.log(chalk.white('\nSubagent calls:'));
    console.log(chalk.blue(`  ℹ Found ${callMatches.length} @call directives`));
  }

  console.log(chalk.gray('\n' + '─'.repeat(40)));
  if (allValid) {
    console.log(chalk.green('✓ Module validation passed'));
  } else {
    console.log(chalk.red('✗ Module validation failed'));
  }
}

/**
 * /cog install <url> -m <name> - 安装模块
 */
async function cmdInstall(args: string[]): Promise<void> {
  // 解析参数
  let source = '';
  let moduleName = '';
  let tag = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-m' && args[i + 1]) {
      moduleName = args[i + 1];
      i++;
    } else if (args[i] === '--tag' && args[i + 1]) {
      tag = args[i + 1];
      i++;
    } else if (!source) {
      source = args[i];
    }
  }

  if (!source || !moduleName) {
    console.log(chalk.red('Usage: /cog install <github:user/repo> -m <module-name> [--tag <version>]'));
    return;
  }

  console.log(chalk.cyan(`\nInstalling ${moduleName} from ${source}...`));
  
  const result = await installModule(source, moduleName, tag || undefined);
  
  if (result.success) {
    console.log(chalk.green(`✓ ${result.message}`));
  } else {
    console.log(chalk.red(`✗ ${result.message}`));
  }
}

/**
 * /cog remove <name> - 删除模块
 */
async function cmdRemove(name: string): Promise<void> {
  if (!name) {
    console.log(chalk.red('Usage: /cog remove <module-name>'));
    return;
  }

  const result = removeModule(name);
  
  if (result.success) {
    console.log(chalk.green(`✓ ${result.message}`));
  } else {
    console.log(chalk.red(`✗ ${result.message}`));
  }
}

/**
 * /cog update <name> - 更新模块
 */
async function cmdUpdate(name: string): Promise<void> {
  if (!name) {
    console.log(chalk.red('Usage: /cog update <module-name>'));
    return;
  }

  console.log(chalk.cyan(`\nUpdating ${name}...`));
  
  const result = await updateModule(name);
  
  if (result.success) {
    console.log(chalk.green(`✓ ${result.message}`));
  } else {
    console.log(chalk.red(`✗ ${result.message}`));
  }
}

/**
 * /cog lock <name> - 锁定版本
 */
async function cmdLock(name: string): Promise<void> {
  if (!name) {
    console.log(chalk.red('Usage: /cog lock <module-name>'));
    return;
  }

  const result = lockModule(name);
  
  if (result.success) {
    console.log(chalk.green(`✓ ${result.message}`));
  } else {
    console.log(chalk.red(`✗ ${result.message}`));
  }
}

/**
 * /cog unlock <name> - 解锁版本
 */
async function cmdUnlock(name: string): Promise<void> {
  if (!name) {
    console.log(chalk.red('Usage: /cog unlock <module-name>'));
    return;
  }

  const result = unlockModule(name);
  
  if (result.success) {
    console.log(chalk.green(`✓ ${result.message}`));
  } else {
    console.log(chalk.red(`✗ ${result.message}`));
  }
}

/**
 * /cog versions <url> - 列出可用版本
 */
async function cmdVersions(source: string): Promise<void> {
  if (!source) {
    console.log(chalk.red('Usage: /cog versions <github:user/repo>'));
    return;
  }

  console.log(chalk.cyan(`\nFetching versions from ${source}...`));
  
  const versions = await listVersions(source);
  
  if (versions.length === 0) {
    console.log(chalk.yellow('No versions found or unable to fetch.'));
    return;
  }

  console.log(chalk.green(`\nAvailable versions (${versions.length}):`));
  for (const version of versions.slice(0, 10)) {
    console.log(chalk.white(`  - ${version}`));
  }
  
  if (versions.length > 10) {
    console.log(chalk.gray(`  ... and ${versions.length - 10} more`));
  }
}

// 工具函数

function getTierColor(tier: string): (text: string) => string {
  switch (tier) {
    case 'exec':
      return chalk.green;
    case 'decision':
      return chalk.yellow;
    case 'exploration':
      return chalk.blue;
    default:
      return chalk.gray;
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
