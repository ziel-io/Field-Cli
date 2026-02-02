#!/usr/bin/env node
/**
 * Field CLI - AI-powered coding assistant with native Cognitive Modules support
 */

import * as readline from 'readline';
import chalk from 'chalk';
import inquirer from 'inquirer';
import autocompletePrompt from 'inquirer-autocomplete-prompt';

// 注册 autocomplete prompt
inquirer.registerPrompt('autocomplete', autocompletePrompt);

import { getProvider, listProviders, Provider, PROVIDERS } from './providers.js';
import { LLMClient, Message, ToolCall } from './llm.js';
import { getApiKey, setApiKey, setDefaultProvider, getDefaultProvider } from './config.js';
import { handleCogCommand, discoverModules, metricsCollector } from './cognitive/index.js';
import { setCurrentClient } from './cognitive/commands.js';
import { selectProvider as smartSelectProvider, SmartSelect } from './cognitive/smart-select.js';
import { 
  getAvailableTools, 
  toOpenAITools,
  executeToolCall,
  formatToolResult,
  extractModuleName,
  buildSystemPromptWithTools,
  toolCallRequiresConfirmation,
  getConfirmationPrompt,
  initPolicyEngine,
  addDynamicAllowRule,
  PolicyDecision,
} from './cognitive/tool-registry.js';

// 对话历史
const history: Message[] = [];
let currentClient: LLMClient | null = null;
let currentProvider: Provider | null = null;

// Token 限制
let tokenLimit: number | null = null;
let tokenWarningThreshold = 0.8;

// 全局 readline 接口
let rl: readline.Interface | null = null;
let rlLineHandler: ((line: string) => void) | null = null;
let rlCloseHandler: (() => void) | null = null;

// AI 自动调用模块开关
let autoInvokeEnabled = true;

/**
 * 过滤掉 AI 响应中的思考内容 (<think>...</think>)
 * MiniMax 等模型会返回包含思考过程的原始内容
 */
function filterThinkingContent(text: string): string {
  // 过滤 <think>...</think> 标签及其内容
  return text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
}

/**
 * 暂停 readline（在使用 inquirer 前调用）
 */
function pauseReadline(): void {
  if (rl) {
    rl.pause();
    if (rlLineHandler) rl.off('line', rlLineHandler);
    if (rlCloseHandler) rl.off('close', rlCloseHandler);
    rl.close();
    rl = null;
  }
}

// 所有可用命令（用于自动补全）
const COMMANDS = [
  '/help',
  '/fie',
  '/fie help',
  '/fie tokens',
  '/fie tokens limit',
  '/fie tokens unlimit',
  '/fie tokens reset',
  '/fie model',
  '/fie stats',
  '/fie clear',
  '/fie auto',
  '/fie auto on',
  '/fie auto off',
  '/fie smart',
  '/model',
  '/api',
  '/tokens',
  '/stats',
  '/clear',
  '/history',
  '/cog',
  '/cog list',
  '/cog info',
  '/cog install',
  '/cog remove',
  '/cog update',
  '/cog validate',
  '/cog lock',
  '/cog unlock',
  '/cog versions',
  '/cog help',
  '/quit',
  '/exit',
];

/**
 * 命令自动补全
 */
function completer(line: string): [string[], string] {
  // 只对 / 开头的输入提供补全
  if (!line.startsWith('/')) {
    return [[], line];
  }
  
  const hits = COMMANDS.filter(cmd => cmd.startsWith(line));
  
  // 如果只输入了 /，显示所有顶级命令
  if (line === '/') {
    const topLevel = COMMANDS.filter(cmd => !cmd.includes(' ') || cmd.split(' ').length === 1);
    return [topLevel, line];
  }
  
  return [hits.length ? hits : COMMANDS, line];
}

// 标记是否在处理中
let isProcessing = false;

/**
 * 恢复 readline（在使用 inquirer 后调用）
 */
function resumeReadline(): void {
  if (rl) return;
  
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    completer: completer,
  });
  
  rlLineHandler = async (line: string) => {
    if (isProcessing) return;
    
    isProcessing = true;
    try {
      await handleInput(line);
    } catch (error) {
      console.log(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
    }
    isProcessing = false;
    
    showPrompt();
  };
  
  rlCloseHandler = () => {
    console.log(chalk.cyan('\nGoodbye!'));
    process.exit(0);
  };

  rl.on('line', rlLineHandler);
  rl.on('close', rlCloseHandler);
}

/**
 * 显示欢迎信息
 */
function showWelcome(): void {
  console.log(chalk.cyan(`
╭─────────────────────────────────────────╮
│                                         │
│   ███████╗██╗███████╗██╗     ██████╗    │
│   ██╔════╝██║██╔════╝██║     ██╔══██╗   │
│   █████╗  ██║█████╗  ██║     ██║  ██║   │
│   ██╔══╝  ██║██╔══╝  ██║     ██║  ██║   │
│   ██║     ██║███████╗███████╗██████╔╝   │
│   ╚═╝     ╚═╝╚══════╝╚══════╝╚═════╝    │
│                                         │
│   AI CLI with Cognitive Modules         │
│                                         │
╰─────────────────────────────────────────╯
`));

  // 显示 Cognitive 模块数量
  const modules = discoverModules();
  if (modules.length > 0) {
    console.log(chalk.gray(`  ${modules.length} cognitive modules available (auto-invoke: ${autoInvokeEnabled ? 'on' : 'off'})`));
  }
  console.log();
}

/**
 * 选择 Provider
 */
async function selectProviderInteractive(): Promise<{ provider: Provider; apiKey: string }> {
  // 暂停 readline 以避免与 inquirer 冲突
  pauseReadline();
  
  try {
    const providers = listProviders();
    
    const { providerName } = await inquirer.prompt([
      {
        type: 'list',
        name: 'providerName',
        message: 'Select your LLM provider:',
        choices: providers.map(p => ({
          name: `${p.displayName} (${p.defaultModel})`,
          value: p.name,
        })),
      },
    ]);

    const provider = getProvider(providerName)!;
    let apiKey = getApiKey(provider.name);

    if (!apiKey) {
      const { key } = await inquirer.prompt<{ key: string }>([
        {
          type: 'password',
          name: 'key',
          message: `Enter your ${provider.displayName} API Key:`,
          mask: '*',
        },
      ]);
      apiKey = key as string;
      
      const { save } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'save',
          message: 'Save API key for future sessions?',
          default: true,
        },
      ]);
      
      if (save) {
        setApiKey(provider.name, apiKey);
        setDefaultProvider(provider.name, provider.defaultModel);
      }
    }

    return { provider, apiKey };
  } finally {
    resumeReadline();
  }
}

/**
 * 显示提示符
 */
function showPrompt(): void {
  if (rl) {
    rl.setPrompt(chalk.blue('> '));
    rl.prompt();
  }
}

/**
 * 检查 Token 限制
 */
function checkTokenLimit(): { exceeded: boolean; warning: boolean; message?: string } {
  if (!tokenLimit) return { exceeded: false, warning: false };
  
  const stats = metricsCollector.getAggregate();
  const used = stats.totalTokens;
  const percentage = used / tokenLimit;
  
  if (percentage >= 1) {
    return {
      exceeded: true,
      warning: true,
      message: `Token limit exceeded! Used: ${metricsCollector.formatTokens(used)} / ${metricsCollector.formatTokens(tokenLimit)}`,
    };
  }
  
  if (percentage >= tokenWarningThreshold) {
    return {
      exceeded: false,
      warning: true,
      message: `⚠️ Warning - Used: ${metricsCollector.formatTokens(used)} / ${metricsCollector.formatTokens(tokenLimit)} (${(percentage * 100).toFixed(0)}%)`,
    };
  }
  
  return { exceeded: false, warning: false };
}

/**
 * 处理用户输入
 */
async function handleInput(input: string): Promise<void> {
  const trimmed = input.trim();
  
  // 命令处理
  if (trimmed === '/') {
    // 只输入了 /，使用 autocomplete 选择命令
    await showCommandAutocomplete();
    return;
  }
  
  if (trimmed.startsWith('/')) {
    await handleCommand(trimmed);
    return;
  }

  if (!trimmed) return;

  if (!currentClient || !currentProvider) {
    console.log(chalk.red('No provider configured. Use /fie model to configure.'));
    return;
  }

  // 检查 Token 限制
  const limitStatus = checkTokenLimit();
  if (limitStatus.exceeded) {
    console.log(chalk.red(limitStatus.message));
    return;
  }
  if (limitStatus.warning) {
    console.log(chalk.yellow(limitStatus.message));
  }

  // 添加用户消息
  history.push({ role: 'user', content: trimmed });

  // 构建消息
  const cognitiveTools = autoInvokeEnabled ? getAvailableTools() : [];
  const openaiTools = toOpenAITools(cognitiveTools);
  const systemPrompt = buildSystemPromptWithTools(cognitiveTools);
  
  const messages: Message[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push(...history);

  // 显示思考中
  process.stdout.write(chalk.gray('Thinking...'));

  try {
    // 使用 Function Calling API（非流式）
    if (autoInvokeEnabled && openaiTools.length > 0) {
      const response = await currentClient.chatWithTools(messages, {
        tools: openaiTools,
        tool_choice: 'auto',
      });

      process.stdout.write('\r' + ' '.repeat(20) + '\r');

      // 检查是否有工具调用
      if (response.toolCalls && response.toolCalls.length > 0) {
        // 处理工具调用
        await handleToolCalls(response, messages, openaiTools);
        return;
      }

      // 普通回复
      if (response.content) {
        const displayContent = filterThinkingContent(response.content);
        console.log(chalk.green('✦ ') + displayContent);
        console.log();
        history.push({ role: 'assistant', content: response.content });
      } else {
        console.log(chalk.yellow('No response received.'));
      }
    } else {
      // 普通流式对话（无工具）
      let response = '';
      let firstChunk = true;
      let inThinkTag = false;
      let buffer = '';
      
      for await (const chunk of currentClient.chat(messages)) {
        response += chunk;
        buffer += chunk;
        
        // 检测 <think> 标签开始
        if (buffer.includes('<think>')) {
          inThinkTag = true;
          // 输出 <think> 之前的内容
          const beforeThink = buffer.split('<think>')[0];
          if (beforeThink && firstChunk) {
            process.stdout.write('\r' + ' '.repeat(20) + '\r');
            process.stdout.write(chalk.green('✦ '));
            firstChunk = false;
          }
          if (beforeThink) {
            process.stdout.write(beforeThink);
          }
          buffer = '<think>' + buffer.split('<think>').slice(1).join('<think>');
        }
        
        // 检测 </think> 标签结束
        if (inThinkTag && buffer.includes('</think>')) {
          inThinkTag = false;
          buffer = buffer.split('</think>').slice(1).join('</think>');
          // 跳过 </think> 后的空白
          buffer = buffer.replace(/^\s+/, '');
        }
        
        // 如果不在 think 标签内，输出内容
        if (!inThinkTag && buffer && !buffer.includes('<think')) {
          if (firstChunk) {
            process.stdout.write('\r' + ' '.repeat(20) + '\r');
            process.stdout.write(chalk.green('✦ '));
            firstChunk = false;
          }
          process.stdout.write(buffer);
          buffer = '';
        }
      }
      
      // 输出剩余内容（如果有）
      if (buffer && !inThinkTag) {
        if (firstChunk) {
          process.stdout.write('\r' + ' '.repeat(20) + '\r');
          process.stdout.write(chalk.green('✦ '));
          firstChunk = false;
        }
        process.stdout.write(buffer);
      }
      
      if (firstChunk) {
        process.stdout.write('\r' + ' '.repeat(20) + '\r');
        console.log(chalk.yellow('No response received.'));
        return;
      }
      
      console.log('\n');
      history.push({ role: 'assistant', content: response });
    }
  } catch (error) {
    process.stdout.write('\r' + ' '.repeat(20) + '\r');
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
  }
}

/**
 * 处理工具调用（Function Calling）
 */
async function handleToolCalls(
  response: { content: string; toolCalls?: ToolCall[] },
  messages: Message[],
  openaiTools: import('./llm.js').ToolDefinition[],
): Promise<void> {
  if (!response.toolCalls || !currentClient || !currentProvider) return;

  // 显示 AI 的文本响应（如果有）
  if (response.content) {
    const displayContent = filterThinkingContent(response.content);
    console.log(chalk.green('✦ ') + displayContent);
    console.log();
  }

  // 将 assistant 消息（带 tool_calls）加入历史
  const assistantMessage: Message = {
    role: 'assistant',
    content: response.content || '',
    tool_calls: response.toolCalls,
  };
  history.push(assistantMessage);

  // 执行每个工具调用
  const toolResults: Message[] = [];
  
  for (const toolCall of response.toolCalls) {
    const moduleName = extractModuleName(toolCall.function.name);
    console.log(chalk.cyan(`📦 Calling module: ${moduleName}`));
    
    // 使用策略引擎检查是否需要确认
    const confirmCheck = await toolCallRequiresConfirmation(toolCall);
    
    // 策略拒绝
    if (confirmCheck.policyResult && confirmCheck.policyResult.decision === PolicyDecision.DENY) {
      const denyReason = confirmCheck.policyResult.rule?.denyMessage || 
        `Policy denied by ${confirmCheck.policyResult.rule?.source || 'default'}`;
      console.log(chalk.red(`🚫 Policy denied: ${denyReason}`));
      
      toolResults.push({
        role: 'tool',
        content: JSON.stringify({ 
          ok: false, 
          error: { code: 'POLICY_DENIED', message: denyReason } 
        }),
        tool_call_id: toolCall.id,
      });
      continue;
    }
    
    // 需要用户确认
    if (confirmCheck.required && confirmCheck.module) {
      console.log(chalk.yellow('\n' + getConfirmationPrompt(toolCall, confirmCheck.module)));
      if (confirmCheck.reason) {
        console.log(chalk.yellow(`Reason: ${confirmCheck.reason}`));
      }
      console.log();
      
      // 暂停 readline 以使用 inquirer
      pauseReadline();
      
      try {
        const { proceed, alwaysAllow } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: `Execute this ${confirmCheck.module.tier || 'unknown'} tier module?`,
            default: false,
          },
          {
            type: 'confirm',
            name: 'alwaysAllow',
            message: 'Always allow this module in the future?',
            default: false,
            when: (answers) => answers.proceed,
          },
        ]);
        
        if (!proceed) {
          console.log(chalk.yellow('Cancelled by user.'));
          
          // 添加取消消息
          toolResults.push({
            role: 'tool',
            content: JSON.stringify({ ok: false, error: { code: 'USER_CANCELLED', message: 'User cancelled the operation' } }),
            tool_call_id: toolCall.id,
          });
          
          resumeReadline();
          continue;
        }
        
        // 如果用户选择始终允许，添加动态策略
        if (alwaysAllow) {
          await addDynamicAllowRule(toolCall, true);  // persist = true
          console.log(chalk.green(`✓ Added to always-allowed list`));
        }
      } finally {
        resumeReadline();
      }
    }
    
    const result = await executeToolCall(
      toolCall,
      currentClient,
      currentProvider.name,
    );
    
    if (result.success) {
      console.log(chalk.green('✓ Module executed successfully'));
      // 显示简要结果
      const resultStr = formatToolResult(result);
      const preview = resultStr.length > 500 ? resultStr.slice(0, 500) + '...' : resultStr;
      console.log(chalk.gray(preview));
    } else {
      console.log(chalk.red(`✗ Module failed: ${result.error}`));
    }
    console.log();
    
    // 构建 tool 消息
    toolResults.push({
      role: 'tool',
      content: formatToolResult(result),
      tool_call_id: toolCall.id,
    });
  }

  // 将工具结果加入历史
  history.push(...toolResults);

  // 让 AI 基于工具结果继续回复
  process.stdout.write(chalk.gray('Summarizing results...'));
  
  const continueMessages: Message[] = [...messages, assistantMessage, ...toolResults];
  
  const finalResponse = await currentClient.chatWithTools(continueMessages, {
    tools: openaiTools,
    tool_choice: 'auto',
  });

  process.stdout.write('\r' + ' '.repeat(30) + '\r');

  // 检查是否还有更多工具调用（递归）
  if (finalResponse.toolCalls && finalResponse.toolCalls.length > 0) {
    await handleToolCalls(finalResponse, continueMessages, openaiTools);
    return;
  }

  // 显示最终回复
  if (finalResponse.content) {
    const displayContent = filterThinkingContent(finalResponse.content);
    console.log(chalk.green('✦ ') + displayContent);
    console.log();
    history.push({ role: 'assistant', content: finalResponse.content });
  }
}

/**
 * 处理命令
 */
async function handleCommand(cmd: string): Promise<void> {
  const parts = cmd.slice(1).split(' ');
  const command = parts[0].toLowerCase();

  // 如果只输入了 /，显示命令列表
  if (!command || command === '') {
    showCommandList();
    return;
  }

  // /fie 命令族
  if (command === 'fie') {
    await handleFieCommand(parts.slice(1));
    return;
  }

  // 兼容旧命令
  switch (command) {
    case 'help':
      showHelp();
      break;
    
    case 'model':
      await switchModel();
      break;
    
    case 'clear':
      history.length = 0;
      console.log(chalk.green('Conversation cleared.'));
      break;
    
    case 'history':
      showHistory();
      break;
    
    case 'tokens':
      showTokens();
      break;
    
    case 'stats':
      showStats();
      break;
    
    case 'quit':
    case 'exit':
      console.log(chalk.cyan('Goodbye!'));
      if (rl) rl.close();
      process.exit(0);
    
    case 'cog':
      await handleCogCommand(parts.slice(1));
      break;
    
    case 'api':
      await changeApiKey();
      break;
    
    default:
      console.log(chalk.yellow(`Unknown command: ${command}. Type /help for help.`));
  }
}

/**
 * 处理 /fie 命令族
 */
async function handleFieCommand(args: string[]): Promise<void> {
  const subCommand = args[0] || 'help';

  switch (subCommand) {
    case 'help':
      showFieHelp();
      break;
    
    case 'model':
      if (args[1]) {
        await switchToModel(args[1]);
      } else {
        await switchModel();
      }
      break;
    
    case 'tokens':
      await handleTokensCommand(args.slice(1));
      break;
    
    case 'stats':
      showStats();
      break;
    
    case 'clear':
      history.length = 0;
      metricsCollector.reset();
      console.log(chalk.green('Conversation and stats cleared.'));
      break;
    
    case 'auto':
      handleAutoCommand(args.slice(1));
      break;
    
    case 'smart':
      handleSmartCommand(args.slice(1));
      break;
    
    default:
      console.log(chalk.yellow(`Unknown fie command: ${subCommand}. Type /fie help for help.`));
  }
}

/**
 * 显示 /fie 帮助
 */
function showFieHelp(): void {
  console.log(chalk.cyan(`
┌─────────────────────────────────────────────────────────┐
│                   /fie Commands                         │
├─────────────────────────────────────────────────────────┤
│  /fie help              Show this help                  │
│  /fie model [name]      Switch model                    │
│  /fie tokens            Show token usage                │
│  /fie tokens limit N    Set token limit                 │
│  /fie tokens unlimit    Remove token limit              │
│  /fie tokens reset      Reset token stats               │
│  /fie stats             Show session statistics         │
│  /fie clear             Clear history and stats         │
│  /fie auto on|off       Toggle auto module invocation   │
│  /fie smart             Smart provider selection        │
├─────────────────────────────────────────────────────────┤
│  Shortcut commands (still work):                        │
│  /model /tokens /stats /clear /history /cog /quit       │
└─────────────────────────────────────────────────────────┘
`));
}

/**
 * 处理 tokens 命令
 */
async function handleTokensCommand(args: string[]): Promise<void> {
  const subCmd = args[0];
  
  if (!subCmd) {
    showTokens();
    return;
  }

  switch (subCmd) {
    case 'limit':
      const limitStr = args[1];
      if (!limitStr) {
        console.log(chalk.red('Usage: /fie tokens limit <number>'));
        return;
      }
      const limit = parseInt(limitStr, 10);
      if (isNaN(limit) || limit <= 0) {
        console.log(chalk.red('Invalid limit. Must be a positive number.'));
        return;
      }
      tokenLimit = limit;
      console.log(chalk.green(`Token limit set to ${metricsCollector.formatTokens(limit)}`));
      break;
    
    case 'unlimit':
      tokenLimit = null;
      console.log(chalk.green('Token limit removed.'));
      break;
    
    case 'reset':
      metricsCollector.reset();
      console.log(chalk.green('Token stats reset.'));
      break;
    
    default:
      console.log(chalk.yellow(`Unknown tokens command: ${subCmd}`));
  }
}

/**
 * 处理 auto 命令
 */
function handleAutoCommand(args: string[]): void {
  const value = args[0];
  
  if (!value) {
    console.log(chalk.white(`Auto module invocation: ${autoInvokeEnabled ? chalk.green('on') : chalk.red('off')}`));
    return;
  }

  if (value === 'on') {
    autoInvokeEnabled = true;
    console.log(chalk.green('Auto module invocation enabled.'));
  } else if (value === 'off') {
    autoInvokeEnabled = false;
    console.log(chalk.yellow('Auto module invocation disabled.'));
  } else {
    console.log(chalk.red('Usage: /fie auto on|off'));
  }
}

/**
 * 处理 smart 命令
 */
function handleSmartCommand(args: string[]): void {
  const strategy = args[0] || 'balanced';
  const taskType = args[1] || 'auto';
  
  const selection = smartSelectProvider({
    taskType: taskType as 'code' | 'analysis' | 'simple' | 'long' | 'vision' | 'auto',
    strategy: strategy as 'auto' | 'quality' | 'balanced' | 'economy' | 'speed',
  });

  console.log(chalk.cyan('\n── Smart Provider Selection ──\n'));
  console.log(chalk.white(`  Recommended: ${chalk.green(selection.provider)}/${chalk.yellow(selection.model)}`));
  console.log(chalk.gray(`  ${selection.reason}`));
  console.log(chalk.gray(`  Score: ${selection.score.toFixed(0)}`));
  console.log();
  
  console.log(chalk.gray('  Quick selections:'));
  console.log(chalk.gray(`    For code:     ${SmartSelect.forCode().provider}/${SmartSelect.forCode().model}`));
  console.log(chalk.gray(`    For analysis: ${SmartSelect.forAnalysis().provider}/${SmartSelect.forAnalysis().model}`));
  console.log(chalk.gray(`    Cheapest:     ${SmartSelect.cheapest().provider}/${SmartSelect.cheapest().model}`));
  console.log(chalk.gray(`    Fastest:      ${SmartSelect.fastest().provider}/${SmartSelect.fastest().model}`));
  console.log();
}

// 命令列表（用于 autocomplete）
const COMMAND_CHOICES = [
  { name: '/help', description: 'Show detailed help' },
  { name: '/model', description: 'Switch LLM provider/model' },
  { name: '/api', description: 'Change API Key' },
  { name: '/cog', description: 'Cognitive module commands' },
  { name: '/cog list', description: 'List all modules' },
  { name: '/cog info', description: 'Show module details' },
  { name: '/cog install', description: 'Install from GitHub' },
  { name: '/cog remove', description: 'Remove a module' },
  { name: '/cog validate', description: 'Validate module' },
  { name: '/tokens', description: 'Show token usage' },
  { name: '/stats', description: 'Show statistics' },
  { name: '/history', description: 'Show conversation history' },
  { name: '/clear', description: 'Clear conversation' },
  { name: '/fie', description: 'Advanced commands' },
  { name: '/fie tokens', description: 'Token management' },
  { name: '/fie auto', description: 'Toggle auto-invoke' },
  { name: '/quit', description: 'Exit Field CLI' },
];

/**
 * 显示命令自动完成（用户输入 / 时）
 */
async function showCommandAutocomplete(): Promise<void> {
  pauseReadline();
  
  try {
    const { command } = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'command',
        message: '> (Ctrl+C to cancel)',
        source: (_answersSoFar: unknown, input: string) => {
          const searchTerm = input || '';
          const filtered = COMMAND_CHOICES.filter(
            (cmd) => cmd.name.toLowerCase().includes(searchTerm.toLowerCase())
          );
          return Promise.resolve(
            filtered.map((cmd) => ({
              name: `${cmd.name.padEnd(15)} ${chalk.gray(cmd.description)}`,
              value: (cmd as { value?: string }).value || cmd.name,
              short: cmd.name,
            }))
          );
        },
        suggestOnly: false,
        searchText: 'Searching...',
        emptyText: 'No commands found',
      },
    ]);
    
    if (command) {
      await handleCommand(command);
    }
  } catch (error) {
    // 用户按了 Ctrl+C 取消
    console.log(chalk.gray('\nCancelled.'));
  } finally {
    resumeReadline();
  }
}

/**
 * 显示命令列表（文本版，作为备用）
 */
function showCommandList(): void {
  console.log(chalk.cyan(`
┌─────────────────────────────────────────────────────────┐
│                   Available Commands                    │
├─────────────────────────────────────────────────────────┤
│  /help       Show detailed help                         │
│  /fie        Field CLI commands (tokens, stats, etc)    │
│  /model      Switch LLM provider/model                  │
│  /api        Change API Key for current provider        │
│  /cog        Cognitive module commands                  │
│  /tokens     Show token usage                           │
│  /stats      Show session statistics                    │
│  /history    Show conversation history                  │
│  /clear      Clear conversation                         │
│  /quit       Exit Field CLI                             │
├─────────────────────────────────────────────────────────┤
│  💡 Type /help for details, or Tab to autocomplete      │
└─────────────────────────────────────────────────────────┘
`));
}

/**
 * 显示帮助
 */
function showHelp(): void {
  console.log(chalk.cyan(`
┌─────────────────────────────────────────────────────────┐
│                   Field CLI Commands                    │
├─────────────────────────────────────────────────────────┤
│  /help       Show this help                             │
│  /fie help   Show /fie commands (tokens, stats, etc)    │
│  /model      Switch LLM provider/model                  │
│  /api        Change API Key for current provider        │
│  /clear      Clear conversation history                 │
│  /history    Show conversation history                  │
│  /tokens     Show token usage                           │
│  /stats      Show session statistics                    │
│  /cog        Cognitive module commands                  │
│  /quit       Exit Field CLI                             │
├─────────────────────────────────────────────────────────┤
│  Cognitive commands (/cog help for details):            │
│    /cog list      List modules                          │
│    /cog info      Show module info                      │
│    /cog install   Install from GitHub                   │
│    /cog validate  Validate module                       │
├─────────────────────────────────────────────────────────┤
│  AI Auto-Invocation:                                    │
│    Modules are automatically called based on your       │
│    request. Toggle with: /fie auto on|off               │
└─────────────────────────────────────────────────────────┘
`));
}

/**
 * 切换模型
 */
async function switchModel(): Promise<void> {
  // selectProviderInteractive 内部已处理 readline 暂停/恢复
  const { provider, apiKey } = await selectProviderInteractive();
  
  // 再次暂停以选择模型
  pauseReadline();
  
  try {
    const { model } = await inquirer.prompt([
      {
        type: 'list',
        name: 'model',
        message: 'Select model:',
        choices: provider.models,
        default: provider.defaultModel,
      },
    ]);

    currentProvider = provider;
    currentClient = new LLMClient(provider, apiKey, model);
    setDefaultProvider(provider.name, model);
    setCurrentClient(currentClient, currentProvider);
    
    console.log(chalk.green(`\nUsing ${provider.displayName} (${model})\n`));
  } finally {
    resumeReadline();
  }
}

/**
 * 修改当前 Provider 的 API Key
 */
async function changeApiKey(): Promise<void> {
  if (!currentProvider) {
    console.log(chalk.yellow('No provider selected. Use /model to select a provider first.'));
    return;
  }
  
  pauseReadline();
  
  try {
    console.log(chalk.cyan(`\nCurrent provider: ${currentProvider.displayName}`));
    console.log(chalk.gray(`API Key env var: ${currentProvider.envKey}\n`));
    
    const { newApiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'newApiKey',
        message: `Enter new API Key for ${currentProvider.displayName}:`,
        mask: '*',
        validate: (input: string) => input.length > 0 || 'API Key cannot be empty',
      },
    ]);
    
    // 保存新的 API Key
    setApiKey(currentProvider.name, newApiKey);
    
    // 更新当前客户端
    const currentModel = currentProvider.defaultModel;
    currentClient = new LLMClient(currentProvider, newApiKey, currentModel);
    setCurrentClient(currentClient, currentProvider);
    
    console.log(chalk.green(`\n✓ API Key updated for ${currentProvider.displayName}`));
    console.log(chalk.gray(`  Saved to ~/.field-cli/credentials.json\n`));
  } finally {
    resumeReadline();
  }
}

/**
 * 直接切换到指定模型
 */
async function switchToModel(modelName: string): Promise<void> {
  // 查找包含此模型的 provider
  for (const [name, provider] of Object.entries(PROVIDERS)) {
    if (provider.models.includes(modelName) || provider.name === modelName) {
      const apiKey = getApiKey(name);
      if (!apiKey) {
        console.log(chalk.red(`No API key found for ${provider.displayName}. Use /model to configure.`));
        return;
      }
      
      currentProvider = provider;
      currentClient = new LLMClient(provider, apiKey, provider.models.includes(modelName) ? modelName : provider.defaultModel);
      setDefaultProvider(name, modelName);
      setCurrentClient(currentClient, currentProvider);
      
      console.log(chalk.green(`Switched to ${provider.displayName} (${modelName})`));
      return;
    }
  }
  
  console.log(chalk.red(`Model '${modelName}' not found. Available providers: ${Object.keys(PROVIDERS).join(', ')}`));
}

/**
 * 显示历史
 */
function showHistory(): void {
  if (history.length === 0) {
    console.log(chalk.yellow('No conversation history.'));
    return;
  }

  console.log(chalk.cyan('\n── Conversation History ──\n'));
  for (const msg of history) {
    const prefix = msg.role === 'user' ? chalk.blue('You: ') : chalk.green('AI: ');
    const content = msg.content.length > 100 
      ? msg.content.slice(0, 100) + '...' 
      : msg.content;
    console.log(prefix + content);
  }
  console.log();
}

/**
 * 显示 Token 使用情况
 */
function showTokens(): void {
  const stats = metricsCollector.getAggregate();
  const status = metricsCollector.getTokenStatus();

  console.log(chalk.cyan('\n── Token Usage ──\n'));
  console.log(chalk.white(`  Total:      ${metricsCollector.formatTokens(stats.totalTokens)}`));
  console.log(chalk.gray(`  Prompt:     ${metricsCollector.formatTokens(stats.totalPromptTokens)}`));
  console.log(chalk.gray(`  Completion: ${metricsCollector.formatTokens(stats.totalCompletionTokens)}`));
  
  if (tokenLimit) {
    const used = stats.totalTokens;
    const percentage = (used / tokenLimit) * 100;
    console.log();
    console.log(chalk.white(`  Limit:      ${metricsCollector.formatTokens(tokenLimit)}`));
    console.log(chalk.white(`  Remaining:  ${metricsCollector.formatTokens(tokenLimit - used)}`));
    console.log(chalk.white(`  Used:       ${percentage.toFixed(1)}%`));
    
    if (percentage >= 100) {
      console.log(chalk.red('\n  ⚠️  Token limit exceeded!'));
    } else if (percentage >= tokenWarningThreshold * 100) {
      console.log(chalk.yellow('\n  ⚠️  Approaching token limit'));
    }
  }
  console.log();
}

/**
 * 显示统计信息
 */
function showStats(): void {
  const stats = metricsCollector.getAggregate();

  console.log(chalk.cyan('\n── Session Statistics ──\n'));
  console.log(chalk.white(`  Executions:    ${stats.totalExecutions}`));
  console.log(chalk.green(`  Success:       ${stats.successCount}`));
  console.log(chalk.red(`  Failures:      ${stats.failureCount}`));
  console.log(chalk.white(`  Success Rate:  ${(stats.successRate * 100).toFixed(1)}%`));
  console.log();
  console.log(chalk.white(`  Avg Latency:   ${stats.avgLatencyMs.toFixed(0)}ms`));
  console.log(chalk.gray(`  P50 Latency:   ${stats.p50LatencyMs.toFixed(0)}ms`));
  console.log(chalk.gray(`  P95 Latency:   ${stats.p95LatencyMs.toFixed(0)}ms`));
  console.log();
  console.log(chalk.white(`  Repair Rate:   ${(stats.repairRate * 100).toFixed(1)}%`));
  console.log();

  // 按 Provider 统计
  const providers = Object.values(stats.byProvider);
  if (providers.length > 0) {
    console.log(chalk.cyan('  By Provider:'));
    for (const p of providers) {
      console.log(chalk.gray(`    ${p.name}: ${p.requests} requests, ${metricsCollector.formatTokens(p.totalTokens)} tokens`));
    }
  }
  console.log();
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  showWelcome();

  // 检查已保存的配置
  const saved = getDefaultProvider();
  if (saved.provider) {
    const provider = getProvider(saved.provider);
    const apiKey = getApiKey(saved.provider);
    
    if (provider && apiKey) {
      currentProvider = provider;
      currentClient = new LLMClient(provider, apiKey, saved.model);
      setCurrentClient(currentClient, currentProvider);
      console.log(chalk.green(`Using ${provider.displayName} (${saved.model || provider.defaultModel})\n`));
    }
  }

  // 如果没有配置，提示选择
  if (!currentClient) {
    const { provider, apiKey } = await selectProviderInteractive();
    currentProvider = provider;
    currentClient = new LLMClient(provider, apiKey);
    setCurrentClient(currentClient, currentProvider);
    console.log(chalk.green(`\nUsing ${provider.displayName} (${provider.defaultModel})\n`));
  }

  console.log(chalk.gray('Type your message or /help for commands.\n'));
  
  // 启动 readline
  resumeReadline();
  showPrompt();
}

// 捕获未处理的错误
process.on('uncaughtException', (error) => {
  console.error(chalk.red(`\nFatal error: ${error.message}`));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red(`\nUnhandled rejection: ${reason}`));
});

main().catch((error) => {
  console.error(chalk.red(`Failed to start: ${error.message}`));
  process.exit(1);
});
