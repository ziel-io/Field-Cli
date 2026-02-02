/**
 * Field CLI - Main App Component
 * UI 风格参考 Kimi Code CLI
 */

import React, { useState, useEffect, useCallback } from 'react';
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

type View = 'chat' | 'provider-select' | 'model-select' | 'api-key-input';

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
  
  useEffect(() => {
    try { setRawMode(true); } catch (e) {}
    
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
        addMessage('info', 'Commands: /help /model /api /cog /stats /history /clear /quit');
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
            addMessage(result.success ? 'success' : 'error', result.success ? '✓' : `✗ ${result.error}`);
            toolResults.push(`[${moduleName}] ${result.success ? 'Success' : 'Failed: ' + result.error}`);
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
  
  const providerItems = listProviders().map(p => ({ label: `${p.displayName}`, value: p.name }));
  const modelItems = pendingProvider?.models.map(m => ({ label: m, value: m })) || [];

  return (
    <Box flexDirection="column" width={terminalWidth}>
      {/* Header */}
      <Header provider={currentProvider} />
      
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

      {/* Provider Select */}
      {view === 'provider-select' && (
        <Box flexDirection="column" marginLeft={2}>
          <Text color="white" bold>Select Provider</Text>
          <Text color="gray" dimColor>ESC cancel</Text>
          <Box marginTop={1}>
            <SelectInput items={providerItems} onSelect={handleProviderSelect} />
          </Box>
        </Box>
      )}

      {/* API Key Input */}
      {view === 'api-key-input' && pendingProvider && (
        <Box flexDirection="column" marginLeft={2}>
          <Text color="white" bold>API Key for {pendingProvider.displayName}</Text>
          <Box marginTop={1}>
            <Text color="cyan">{apiKeyInput ? '*'.repeat(apiKeyInput.length) : '_'}</Text>
          </Box>
          <Text color="gray" dimColor>Enter confirm • ESC cancel</Text>
        </Box>
      )}

      {/* Model Select */}
      {view === 'model-select' && pendingProvider && (
        <Box flexDirection="column" marginLeft={2}>
          <Text color="white" bold>Select Model</Text>
          <Text color="gray" dimColor>ESC cancel</Text>
          <Box marginTop={1}>
            <SelectInput items={modelItems} onSelect={handleModelSelect} />
          </Box>
        </Box>
      )}
    </Box>
  );
}
