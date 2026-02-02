/**
 * Message List - 简洁风格
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'error' | 'info' | 'success' | 'warning';
  content: string;
}

interface MessageListProps {
  messages: ChatMessage[];
  streamingText?: string;
  isLoading?: boolean;
  maxMessages?: number;
}

export function MessageList({
  messages,
  streamingText,
  isLoading,
  maxMessages = 10,
}: MessageListProps): React.ReactElement {
  const visibleMessages = messages.slice(-maxMessages);

  return (
    <Box flexDirection="column" marginBottom={1}>
      {visibleMessages.map((msg) => (
        <Box key={msg.id} marginBottom={0}>
          {msg.role === 'user' && (
            <Text>
              <Text color="cyan" bold>user@FieldCLI </Text>
              <Text color="yellow">🚀 </Text>
              <Text color="white">{msg.content}</Text>
            </Text>
          )}
          
          {msg.role === 'assistant' && (
            <Text>
              <Text color="yellow">● </Text>
              <Text italic color="gray">{msg.content}</Text>
            </Text>
          )}
          
          {msg.role === 'info' && (
            <Text color="gray">{msg.content}</Text>
          )}
          
          {msg.role === 'error' && (
            <Text color="red">{msg.content}</Text>
          )}
          
          {msg.role === 'success' && (
            <Text color="green">{msg.content}</Text>
          )}
          
          {msg.role === 'warning' && (
            <Text color="yellow">⚠ {msg.content}</Text>
          )}
          
          {msg.role === 'system' && (
            <Text color="gray" dimColor>{msg.content}</Text>
          )}
        </Box>
      ))}

      {streamingText && (
        <Text>
          <Text color="yellow">● </Text>
          <Text italic color="gray">{streamingText}</Text>
        </Text>
      )}

      {isLoading && !streamingText && (
        <Text color="yellow">
          <Spinner type="dots" />
          <Text color="gray"> Thinking...</Text>
        </Text>
      )}
    </Box>
  );
}
