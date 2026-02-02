/**
 * Input Prompt Component
 * UI 风格参考 Kimi Code CLI - 细线边框
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { useTextBuffer } from '../hooks/useTextBuffer.js';
import { useSlashCompletion } from '../hooks/useSlashCompletion.js';
import { SuggestionsDisplay } from './SuggestionsDisplay.js';
import { getAllCommands } from '../commands/index.js';

interface InputPromptProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export function InputPrompt({
  onSubmit,
  disabled = false,
}: InputPromptProps): React.ReactElement {
  const { setRawMode } = useStdin();
  
  const buffer = useTextBuffer();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [escPressCount, setEscPressCount] = useState(0);
  
  const allCommands = getAllCommands();
  
  const { isSlashCommand, suggestions } = useSlashCompletion({
    commands: allCommands,
    text: buffer.text,
    cursorRow: buffer.cursorRow,
  });
  
  useEffect(() => {
    if (isSlashCommand && suggestions.length > 0) {
      setShowSuggestions(true);
      // 确保 selectedIndex 不越界
      setSelectedIndex(prev => Math.min(prev, suggestions.length - 1));
    } else {
      setShowSuggestions(false);
      setSelectedIndex(0);
    }
  }, [isSlashCommand, suggestions.length]);
  
  useEffect(() => {
    if (escPressCount > 0) {
      const timer = setTimeout(() => setEscPressCount(0), 500);
      return () => clearTimeout(timer);
    }
  }, [escPressCount]);
  
  useEffect(() => {
    try { setRawMode(true); } catch (e) {}
  }, [setRawMode]);
  
  const handleSubmit = useCallback(() => {
    if (disabled) return;
    
    // 如果有建议菜单，选中后直接执行命令
    if (showSuggestions && suggestions.length > 0) {
      const selected = suggestions[selectedIndex];
      if (selected) {
        onSubmit(selected.name);  // 直接执行
        buffer.clear();
        setShowSuggestions(false);
        return;
      }
    }
    
    const text = buffer.text.trim();
    if (text) {
      onSubmit(text);
      buffer.clear();
    }
  }, [disabled, showSuggestions, suggestions, selectedIndex, buffer, onSubmit]);
  
  useInput((input, key) => {
    if (disabled) return;
    
    if (key.escape) {
      if (showSuggestions) { setShowSuggestions(false); return; }
      if (escPressCount === 0) { setEscPressCount(1); }
      else { buffer.clear(); setEscPressCount(0); }
      return;
    }
    
    setEscPressCount(0);
    
    if (key.tab && showSuggestions && suggestions.length > 0) {
      const selected = suggestions[selectedIndex];
      if (selected) { buffer.setText(selected.name + ' '); setShowSuggestions(false); }
      return;
    }
    
    if (key.return) { handleSubmit(); return; }
    
    if (showSuggestions && suggestions.length > 0) {
      if (key.upArrow) { setSelectedIndex(p => (p - 1 + suggestions.length) % suggestions.length); return; }
      if (key.downArrow) { setSelectedIndex(p => (p + 1) % suggestions.length); return; }
    }
    
    if (key.leftArrow) { buffer.moveCursorLeft(); return; }
    if (key.rightArrow) { buffer.moveCursorRight(); return; }
    if (key.ctrl && input === 'a') { buffer.moveCursorToStart(); return; }
    if (key.ctrl && input === 'e') { buffer.moveCursorToEnd(); return; }
    if (key.backspace || key.delete) { buffer.deleteChar(); return; }
    if (key.ctrl && input === 'u') { buffer.clear(); return; }
    
    if (input && !key.ctrl && !key.meta) buffer.insertChar(input);
  }, { isActive: !disabled });
  
  const { text, cursorPosition } = buffer;

  return (
    <Box flexDirection="column">
      {/* 输入框 - 无边框 */}
      <Box>
        <Text color="cyan" bold>{'> '}</Text>
        {text.length === 0 ? (
          <>
            <Text color="cyan">|</Text>
            <Text color="gray" dimColor>Type message or / for commands</Text>
          </>
        ) : (
          <>
            <Text color="white">{text.slice(0, cursorPosition)}</Text>
            <Text color="cyan" bold>|</Text>
            <Text color="white">{text.slice(cursorPosition)}</Text>
          </>
        )}
      </Box>
      
      {/* 建议菜单 */}
      {showSuggestions && (
        <SuggestionsDisplay
          suggestions={suggestions}
          selectedIndex={selectedIndex}
          visible={true}
        />
      )}
    </Box>
  );
}
