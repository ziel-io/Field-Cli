/**
 * Field CLI - Main App Component
 * UI 风格参考 Kimi Code CLI
 * 
 * v2.1: Enhanced Interactive Setup with detailed model descriptions
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useApp, useInput, useStdin, useStdout } from 'ink';
import SelectInput from 'ink-select-input';

import { InputPrompt } from './components/InputPrompt.js';
import { MessageList, type ChatMessage } from './components/MessageList.js';

import { Provider, getProvider, listProviders } from '../providers.js';
import { LLMClient, Message } from '../llm.js';
import { getApiKey, setApiKey, setDefaultProvider, getDefaultProvider } from '../config.js';
import { handleCogCommand, discoverModules, metricsCollector } from '../cognitive/index.js';
import { setCurrentClient } from '../cognitive/commands.js';
import {
  getAvailableTools,
  toOpenAITools,
  executeToolCall,
  extractModuleName,
  buildSystemPromptWithTools,
  toolCallRequiresConfirmation,
  PolicyDecision,
} from '../cognitive/tool-registry.js';
import {
  startBackgroundUpdateCheck,
  getStartupCheckResult,
  getVersionInfo,
  formatUpdateNotice,
  getUpdateCommand,
  checkForUpdates,
  getCurrentVersion,
} from '../version-manager.js';

type View = 'chat' | 'provider-select' | 'model-select' | 'api-key-input';

// =============================================================================
// Enhanced Provider & Model Configurations
// =============================================================================

interface ModelDetail {
  id: string;
  description: string;
  price: string;        // e.g., "$0.27/1M"
  context: string;      // e.g., "128K"
  tags: string[];       // e.g., ["推荐", "代码最强"]
  capabilities: string[];  // e.g., ["code", "reasoning"]
}

interface ProviderDetail {
  name: string;
  displayName: string;
  badge?: string;       // e.g., "⭐ 推荐", "💰 最便宜"
  models: ModelDetail[];
}

const PROVIDER_DETAILS: Record<string, ProviderDetail> = {
  minimax: {
    name: 'minimax',
    displayName: 'MiniMax',
    badge: '⭐ 推荐',
    models: [
      { id: 'MiniMax-M2.1', description: '最新旗舰模型', price: '$0.75/1M', context: '64K', tags: ['推荐', '均衡'], capabilities: ['code', 'creative'] },
      { id: 'abab6.5s-chat', description: '高性价比', price: '$0.3/1M', context: '245K', tags: ['便宜', '长文本'], capabilities: ['chat'] },
    ],
  },
  deepseek: {
    name: 'deepseek',
    displayName: 'DeepSeek',
    badge: '💰 超低价',
    models: [
      { id: 'deepseek-chat', description: 'V3.2 最新版', price: '$0.27/1M', context: '64K', tags: ['最便宜', '代码强'], capabilities: ['code', 'reasoning', 'chinese'] },
      { id: 'deepseek-reasoner', description: '深度推理模式', price: '$2.19/1M', context: '64K', tags: ['推理'], capabilities: ['reasoning'] },
    ],
  },
  kimi: {
    name: 'kimi',
    displayName: 'Kimi (Moonshot)',
    badge: '📚 超长上下文',
    models: [
      { id: 'kimi-k2.5', description: '最新多模态', price: '$1.25/1M', context: '256K', tags: ['推荐', '中文最强'], capabilities: ['code', 'reasoning', 'chinese'] },
      { id: 'moonshot-v1-128k', description: '128K 长文本', price: '$0.8/1M', context: '128K', tags: ['长文本'], capabilities: ['chinese'] },
      { id: 'moonshot-v1-32k', description: '32K 标准版', price: '$0.24/1M', context: '32K', tags: ['便宜'], capabilities: ['chinese'] },
    ],
  },
  anthropic: {
    name: 'anthropic',
    displayName: 'Claude (Anthropic)',
    badge: '💪 代码最强',
    models: [
      { id: 'claude-sonnet-4-5-20250514', description: 'Sonnet 4.5 最新', price: '$3/1M', context: '200K', tags: ['推荐', '代码最强'], capabilities: ['code', 'reasoning', 'creative'] },
      { id: 'claude-opus-4-5-20250514', description: 'Opus 4.5 旗舰', price: '$15/1M', context: '200K', tags: ['最强'], capabilities: ['code', 'reasoning', 'creative'] },
    ],
  },
  openai: {
    name: 'openai',
    displayName: 'OpenAI',
    badge: '🧠 推理强',
    models: [
      { id: 'gpt-4o', description: '多模态旗舰', price: '$5/1M', context: '128K', tags: ['推荐', '多模态'], capabilities: ['code', 'reasoning', 'vision'] },
      { id: 'gpt-4o-mini', description: '轻量快速', price: '$0.15/1M', context: '128K', tags: ['便宜', '快'], capabilities: ['fast'] },
      { id: 'o1', description: '深度推理', price: '$15/1M', context: '200K', tags: ['推理最强'], capabilities: ['reasoning'] },
    ],
  },
  qwen: {
    name: 'qwen',
    displayName: 'Qwen (通义千问)',
    badge: '🇨🇳 中文优化',
    models: [
      { id: 'qwen-max', description: '最大能力版', price: '$2.4/1M', context: '32K', tags: ['推荐'], capabilities: ['code', 'reasoning', 'chinese'] },
      { id: 'qwen-plus', description: '平衡版本', price: '$0.8/1M', context: '128K', tags: ['长文本'], capabilities: ['chinese'] },
      { id: 'qwen-turbo', description: '极速版', price: '$0.3/1M', context: '128K', tags: ['便宜', '快'], capabilities: ['fast', 'chinese'] },
    ],
  },
  gemini: {
    name: 'gemini',
    displayName: 'Gemini (Google)',
    badge: '🌟 百万上下文',
    models: [
      { id: 'gemini-2.0-flash', description: '极速版', price: '$0.7/1M', context: '1M', tags: ['快', '长文本'], capabilities: ['fast', 'vision'] },
      { id: 'gemini-2.5-pro', description: '旗舰版', price: '$3.5/1M', context: '1M', tags: ['推荐'], capabilities: ['code', 'reasoning', 'vision'] },
    ],
  },
  together: {
    name: 'together',
    displayName: 'Together AI',
    badge: '🔓 开源模型',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', description: 'Llama 3.3 70B', price: '$0.88/1M', context: '128K', tags: ['开源'], capabilities: ['code'] },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', description: 'Qwen 2.5 72B', price: '$1.2/1M', context: '128K', tags: ['开源', '中文'], capabilities: ['chinese'] },
    ],
  },
  openrouter: {
    name: 'openrouter',
    displayName: 'OpenRouter',
    badge: '🔀 多模型路由',
    models: [
      { id: 'anthropic/claude-sonnet-4', description: 'Claude via OR', price: '$3/1M', context: '200K', tags: [], capabilities: ['code'] },
      { id: 'openai/gpt-4o', description: 'GPT-4o via OR', price: '$5/1M', context: '128K', tags: [], capabilities: ['code'] },
    ],
  },
  custom: {
    name: 'custom',
    displayName: 'Custom (自定义)',
    models: [
      { id: 'custom', description: '输入 OpenAI 兼容的模型名', price: '-', context: '-', tags: [], capabilities: [] },
    ],
  },
};

/**
 * 获取增强的 Provider 列表项
 */
function getEnhancedProviderItems(): Array<{ label: string; value: string }> {
  const providers = listProviders();
  return providers.map(p => {
    const detail = PROVIDER_DETAILS[p.name];
    const badge = detail?.badge || '';
    const label = badge ? `${badge} ${p.displayName}` : p.displayName;
    return { label, value: p.name };
  });
}

/**
 * 获取增强的 Model 列表项
 */
function getEnhancedModelItems(providerName: string): Array<{ label: string; value: string }> {
  const detail = PROVIDER_DETAILS[providerName];
  if (!detail) return [];
  
  return detail.models.map(m => {
    const tags = m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : '';
    const label = `${m.id}${tags}\n   ${m.description} · ${m.context} · ${m.price}`;
    return { label, value: m.id };
  });
}

let messageId = 0;
const genId = () => `msg-${++messageId}`;

function filterThinkingContent(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
}

/**
 * Header 组件 - 直接使用 gemini-cli-cognitive 的 logo
 */
function Header({ provider }: { provider: Provider | null }): React.ReactElement {
  const logo = `╭───────────────────────────────────────────────────────────────╮
│                                                               │
│  ██████╗   Welcome to Field CLI!                              │
│  █ ■■ █    The AI-powered coding assistant with               │
│  ██████╝   native Cognitive Modules support.                  │
│                                                               │
│  Send /help for help, /cog for Cognitive commands.            │
│                                                               │
╰───────────────────────────────────────────────────────────────╯`;

  return (
    <Box marginBottom={1}>
      <Text color="blue">{logo}</Text>
    </Box>
  );
}

/**
 * 模型信息（Header 下方单独显示）
 */
function ModelInfo({ provider, modelName }: { provider: Provider | null; modelName: string | null }): React.ReactElement | null {
  if (!provider) return null;
  
  return (
    <Box marginBottom={1}>
      <Text color="gray">Model: </Text>
      <Text color="cyan">{modelName || provider.defaultModel}</Text>
      <Text color="gray"> (powered by </Text>
      <Text color="cyan">{provider.displayName}</Text>
      <Text color="gray">)</Text>
    </Box>
  );
}


/**
 * 主应用组件
 */
export default function App(): React.ReactElement {
  const { exit } = useApp();
  const { setRawMode } = useStdin();
  const { stdout } = useStdout();
  
  const terminalWidth = stdout?.columns || 80;
  
  const [view, setView] = useState<View>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  
  const [currentProvider, setCurrentProvider] = useState<Provider | null>(null);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [currentClient, setCurrentClientState] = useState<LLMClient | null>(null);
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  
  const [autoInvokeEnabled, setAutoInvokeEnabled] = useState(true);
  const [updateNotice, setUpdateNotice] = useState<string | null>(null);
  
  useEffect(() => {
    try { setRawMode(true); } catch (e) {}
    
    // 启动后台更新检查
    startBackgroundUpdateCheck();
    
    // 检查更新结果（非阻塞）
    getStartupCheckResult().then(info => {
      if (info?.hasUpdate) {
        setUpdateNotice(formatUpdateNotice(info));
      }
    });
    
    const saved = getDefaultProvider();
    if (saved.provider) {
      const provider = getProvider(saved.provider);
      const apiKey = getApiKey(saved.provider);
      
      if (provider && apiKey) {
        const client = new LLMClient(provider, apiKey, saved.model);
        setCurrentProvider(provider);
        setCurrentModel(saved.model || provider.defaultModel);
        setCurrentClientState(client);
        setCurrentClient(client, provider);
      } else {
        setView('provider-select');
      }
    } else {
      setView('provider-select');
    }
  }, []);
  
  const addMessage = useCallback((role: ChatMessage['role'], content: string) => {
    setMessages(prev => [...prev, { id: genId(), role, content }]);
  }, []);
  
  const handleCommand = useCallback(async (cmd: string) => {
    const parts = cmd.slice(1).split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);
    
    switch (command) {
      case 'help':
      case 'h':
        addMessage('info', 'Commands: /help /model /api /version /cog /stats /history /clear /quit');
        break;
      case 'version':
      case 'v':
        try {
          const versionInfo = await getVersionInfo();
          let msg = `Field CLI v${versionInfo.current}`;
          if (versionInfo.hasUpdate && versionInfo.latest) {
            msg += `\n🆕 Update available: ${versionInfo.latest} (${versionInfo.updateType})`;
            msg += `\n   Run: ${getUpdateCommand()}`;
          } else {
            msg += '\n✓ You are on the latest version';
          }
          if (versionInfo.lastCheck) {
            msg += `\nLast check: ${new Date(versionInfo.lastCheck).toLocaleString()}`;
          }
          addMessage('info', msg);
        } catch (error) {
          addMessage('info', `Field CLI v${getCurrentVersion()}`);
        }
        break;
      case 'update':
        try {
          addMessage('info', '🔄 Checking for updates...');
          const updateInfo = await checkForUpdates({ force: true });
          if (updateInfo?.hasUpdate) {
            addMessage('success', `🆕 Update available: ${updateInfo.currentVersion} → ${updateInfo.latestVersion}`);
            addMessage('info', `Run: ${getUpdateCommand()}`);
            if (updateInfo.changelog) {
              addMessage('info', `Changelog:\n${updateInfo.changelog.slice(0, 500)}${updateInfo.changelog.length > 500 ? '...' : ''}`);
            }
          } else {
            addMessage('success', '✓ You are on the latest version');
          }
        } catch (error) {
          addMessage('error', 'Failed to check for updates');
        }
        break;
      case 'model':
        setView('provider-select');
        break;
      case 'api':
        if (currentProvider) {
          setPendingProvider(currentProvider);
          setApiKeyInput('');
          setView('api-key-input');
        } else {
          addMessage('error', 'No provider. Use /model first.');
        }
        break;
      case 'cog':
        try {
          const originalLog = console.log;
          let output = '';
          console.log = (...args) => { output += args.join(' ') + '\n'; };
          await handleCogCommand(args);
          console.log = originalLog;
          if (output.trim()) addMessage('info', output.trim());
        } catch (error) {
          addMessage('error', `${error instanceof Error ? error.message : error}`);
        }
        break;
      case 'stats':
        const stats = metricsCollector.getAggregate();
        addMessage('info', `Executions: ${stats.totalExecutions}, Success: ${(stats.successRate * 100).toFixed(0)}%`);
        break;
      case 'tokens':
      case 't':
        addMessage('info', `History: ${history.length} messages, ~${history.reduce((acc, m) => acc + m.content.length, 0)} chars`);
        break;
      case 'fie':
        // /fie 子命令处理
        const fieSubCmd = args[0]?.toLowerCase();
        if (fieSubCmd === 'auto') {
          const onOff = args[1]?.toLowerCase();
          if (onOff === 'on') {
            setAutoInvokeEnabled(true);
            addMessage('success', 'Auto-invoke enabled');
          } else if (onOff === 'off') {
            setAutoInvokeEnabled(false);
            addMessage('success', 'Auto-invoke disabled');
          } else {
            addMessage('info', `Auto-invoke: ${autoInvokeEnabled ? 'ON' : 'OFF'}`);
          }
        } else if (fieSubCmd === 'tokens') {
          const tokenSubCmd = args[1]?.toLowerCase();
          if (tokenSubCmd === 'reset') {
            setHistory([]);
            addMessage('success', 'Token counter reset');
          } else {
            const totalChars = history.reduce((acc, m) => acc + m.content.length, 0);
            const estimatedTokens = Math.ceil(totalChars / 4);  // 粗略估算
            addMessage('info', `Estimated tokens: ~${estimatedTokens} (${totalChars} chars)`);
          }
        } else {
          addMessage('info', '/fie auto [on|off] - Toggle auto-invoke\n/fie tokens [reset] - Token info');
        }
        break;
      case 'history':
        addMessage('info', `${history.length} messages in history`);
        break;
      case 'clear':
        setHistory([]);
        setMessages([]);
        break;
      case 'quit':
      case 'q':
      case 'exit':
        exit();
        break;
      default:
        addMessage('error', `Unknown: /${command}`);
    }
  }, [currentProvider, history, exit, addMessage]);
  
  const handleSubmit = useCallback(async (text: string) => {
    if (text.startsWith('/')) {
      await handleCommand(text);
      return;
    }
    
    if (!currentClient || !currentProvider) {
      addMessage('error', 'No provider. Use /model');
      return;
    }
    
    addMessage('user', text);
    setHistory(prev => [...prev, { role: 'user', content: text }]);
    await sendMessage(text);
  }, [currentClient, currentProvider, handleCommand, addMessage]);
  
  const sendMessage = useCallback(async (userMessage: string) => {
    if (!currentClient || !currentProvider) return;
    
    setIsLoading(true);
    setStreamingText('');
    
    try {
      const cognitiveTools = autoInvokeEnabled ? getAvailableTools() : [];
      const openaiTools = toOpenAITools(cognitiveTools);
      const systemPrompt = buildSystemPromptWithTools(cognitiveTools);
      
      const messagesToSend: Message[] = [];
      if (systemPrompt) messagesToSend.push({ role: 'system', content: systemPrompt });
      messagesToSend.push(...history, { role: 'user', content: userMessage });
      
      let fullResponse = '';
      
      if (openaiTools.length > 0) {
        const response = await currentClient.chatWithTools(messagesToSend, { tools: openaiTools });
        
        if (response.toolCalls && response.toolCalls.length > 0) {
          if (response.content) addMessage('assistant', filterThinkingContent(response.content));
          
          const toolResults: string[] = [];
          for (const toolCall of response.toolCalls) {
            const moduleName = extractModuleName(toolCall.function.name);
            addMessage('info', `📦 ${moduleName}`);
            
            const confirmCheck = await toolCallRequiresConfirmation(toolCall);
            if (confirmCheck.policyResult?.decision === PolicyDecision.DENY) {
              addMessage('error', '🚫 Denied');
              toolResults.push(`[${moduleName}] Denied by policy`);
              continue;
            }
            
            const result = await executeToolCall(toolCall, currentClient, currentProvider.name);
            
            if (result.success) {
              addMessage('success', '✓');
              // 显示模块返回的结果
              if (result.result) {
                try {
                  const resultStr = typeof result.result === 'string' 
                    ? result.result 
                    : JSON.stringify(result.result, null, 2);
                  // 限制显示长度，避免过长
                  const displayResult = resultStr.length > 2000 
                    ? resultStr.slice(0, 2000) + '\n... (truncated)'
                    : resultStr;
                  addMessage('info', displayResult);
                } catch {
                  addMessage('info', String(result.result));
                }
              }
              toolResults.push(`[${moduleName}] Success`);
            } else {
              addMessage('error', `✗ ${result.error}`);
              toolResults.push(`[${moduleName}] Failed: ${result.error}`);
            }
          }
          
          // 将 tool 执行结果加入历史，让模型知道执行了什么
          if (toolResults.length > 0) {
            setHistory(prev => [...prev, { 
              role: 'assistant', 
              content: `Executed tools:\n${toolResults.join('\n')}` 
            }]);
          }
        } else {
          fullResponse = filterThinkingContent(response.content);
          addMessage('assistant', fullResponse);
          setHistory(prev => [...prev, { role: 'assistant', content: fullResponse }]);
        }
      } else {
        for await (const chunk of currentClient.chat(messagesToSend)) {
          fullResponse += chunk;
          setStreamingText(filterThinkingContent(fullResponse));
        }
        
        fullResponse = filterThinkingContent(fullResponse);
        setStreamingText('');
        addMessage('assistant', fullResponse);
        setHistory(prev => [...prev, { role: 'assistant', content: fullResponse }]);
      }
    } catch (error) {
      addMessage('error', `${error instanceof Error ? error.message : error}`);
    } finally {
      setIsLoading(false);
    }
  }, [currentClient, currentProvider, history, autoInvokeEnabled, addMessage]);
  
  const handleProviderSelect = useCallback((item: { value: string }) => {
    const provider = getProvider(item.value);
    if (provider) {
      setPendingProvider(provider);
      const apiKey = getApiKey(provider.name);
      setView(apiKey ? 'model-select' : 'api-key-input');
      setApiKeyInput('');
    }
  }, []);
  
  const handleModelSelect = useCallback((item: { value: string }) => {
    if (!pendingProvider) return;
    const apiKey = getApiKey(pendingProvider.name);
    if (!apiKey) { setView('chat'); return; }
    
    const client = new LLMClient(pendingProvider, apiKey, item.value);
    setCurrentProvider(pendingProvider);
    setCurrentModel(item.value);
    setCurrentClientState(client);
    setCurrentClient(client, pendingProvider);
    setDefaultProvider(pendingProvider.name, item.value);
    setPendingProvider(null);
    setView('chat');
  }, [pendingProvider]);
  
  // API Key 输入 - 只在 api-key-input 视图时活跃
  useInput((input, key) => {
    if (key.escape) { setView('chat'); return; }
    if (key.return && pendingProvider && apiKeyInput.trim()) {
      setApiKey(pendingProvider.name, apiKeyInput.trim());
      setView('model-select');
      return;
    }
    if (key.backspace || key.delete) { setApiKeyInput(prev => prev.slice(0, -1)); return; }
    if (input && !key.ctrl && !key.meta) setApiKeyInput(prev => prev + input);
  }, { isActive: view === 'api-key-input' });
  
  // Provider/Model 选择界面 - ESC 返回
  useInput((input, key) => {
    if (key.escape) setView('chat');
  }, { isActive: view === 'provider-select' || view === 'model-select' });
  
  // 全局 Ctrl+C 退出 - 始终活跃
  useInput((input, key) => {
    if (input === 'c' && key.ctrl) exit();
  });
  
  // 增强的 Provider 和 Model 列表
  const providerItems = useMemo(() => getEnhancedProviderItems(), []);
  const modelItems = useMemo(() => {
    if (!pendingProvider) return [];
    return getEnhancedModelItems(pendingProvider.name);
  }, [pendingProvider]);

  // 获取当前选中 Provider 的详情
  const pendingProviderDetail = pendingProvider ? PROVIDER_DETAILS[pendingProvider.name] : null;

  return (
    <Box flexDirection="column" width={terminalWidth}>
      {/* Header */}
      <Header provider={currentProvider} />
      
      {/* Update Notice */}
      {updateNotice && (
        <Box marginBottom={1}>
          <Text color="yellow">{updateNotice}</Text>
        </Box>
      )}
      
      {/* Model Info */}
      <ModelInfo provider={currentProvider} modelName={currentModel} />

      {/* Chat View */}
      {view === 'chat' && (
        <Box flexDirection="column">
          <MessageList
            messages={messages}
            streamingText={streamingText}
            isLoading={isLoading}
            maxMessages={8}
          />
          
          <InputPrompt onSubmit={handleSubmit} disabled={isLoading} />
        </Box>
      )}

      {/* Provider Select - Enhanced */}
      {view === 'provider-select' && (
        <Box flexDirection="column" marginLeft={2}>
          <Box marginBottom={1}>
            <Text color="cyan" bold>╭─ Select Provider ─────────────────────────────────────╮</Text>
          </Box>
          <Box flexDirection="column" paddingLeft={1}>
            <SelectInput items={providerItems} onSelect={handleProviderSelect} />
          </Box>
          <Box marginTop={1}>
            <Text color="gray" dimColor>↑↓ Navigate · Enter Select · ESC Cancel</Text>
          </Box>
          <Box>
            <Text color="cyan" bold>╰───────────────────────────────────────────────────────╯</Text>
          </Box>
        </Box>
      )}

      {/* API Key Input - Enhanced */}
      {view === 'api-key-input' && pendingProvider && (
        <Box flexDirection="column" marginLeft={2}>
          <Box marginBottom={1}>
            <Text color="cyan" bold>╭─ API Key ─────────────────────────────────────────────╮</Text>
          </Box>
          <Box flexDirection="column" paddingLeft={1}>
            <Box>
              <Text color="white" bold>{pendingProviderDetail?.badge || ''} {pendingProvider.displayName}</Text>
            </Box>
            <Box marginTop={1}>
              <Text color="gray">API Key: </Text>
              <Text color="yellow">{apiKeyInput ? '*'.repeat(Math.min(apiKeyInput.length, 40)) : '(enter your API key)'}</Text>
            </Box>
            <Box marginTop={1}>
              <Text color="gray" dimColor>
                Get key from: {pendingProvider.name === 'deepseek' ? 'platform.deepseek.com' :
                  pendingProvider.name === 'kimi' ? 'platform.moonshot.cn' :
                  pendingProvider.name === 'minimax' ? 'api.minimax.chat' :
                  pendingProvider.name === 'openai' ? 'platform.openai.com' :
                  pendingProvider.name === 'anthropic' ? 'console.anthropic.com' :
                  pendingProvider.name === 'qwen' ? 'dashscope.aliyun.com' :
                  pendingProvider.name === 'gemini' ? 'aistudio.google.com' :
                  'provider website'}
              </Text>
            </Box>
          </Box>
          <Box marginTop={1}>
            <Text color="gray" dimColor>Enter Confirm · ESC Cancel</Text>
          </Box>
          <Box>
            <Text color="cyan" bold>╰───────────────────────────────────────────────────────╯</Text>
          </Box>
        </Box>
      )}

      {/* Model Select - Enhanced with descriptions */}
      {view === 'model-select' && pendingProvider && pendingProviderDetail && (
        <Box flexDirection="column" marginLeft={2}>
          <Box marginBottom={1}>
            <Text color="cyan" bold>╭─ Select Model ({pendingProviderDetail.displayName}) ──────────────────────────╮</Text>
          </Box>
          <Box flexDirection="column" paddingLeft={1}>
            {/* 显示模型列表 */}
            {pendingProviderDetail.models.map((model, index) => (
              <Box key={model.id} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text color={index === 0 ? 'green' : 'white'}>
                    {index === 0 ? '● ' : '○ '}
                  </Text>
                  <Text color="white" bold>{model.id}</Text>
                  {model.tags.length > 0 && (
                    <Text color="yellow"> [{model.tags.join(', ')}]</Text>
                  )}
                </Box>
                <Box paddingLeft={2}>
                  <Text color="gray">{model.description} · </Text>
                  <Text color="cyan">{model.context}</Text>
                  <Text color="gray"> · </Text>
                  <Text color="green">{model.price}</Text>
                </Box>
              </Box>
            ))}
            <Box marginTop={1}>
              <SelectInput 
                items={modelItems.map(m => ({ label: m.value, value: m.value }))} 
                onSelect={handleModelSelect} 
              />
            </Box>
          </Box>
          <Box marginTop={1}>
            <Text color="gray" dimColor>↑↓ Navigate · Enter Select · ESC Back</Text>
          </Box>
          <Box>
            <Text color="cyan" bold>╰───────────────────────────────────────────────────────╯</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
