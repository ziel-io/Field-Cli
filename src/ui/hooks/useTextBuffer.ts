/**
 * Text Buffer Hook - 管理文本输入状态
 * 参考 gemini-cli-cognitive 的 text-buffer.ts
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface TextBufferState {
  text: string;
  cursorPosition: number;
  lines: string[];
  cursorRow: number;
  cursorCol: number;
}

export interface UseTextBufferOptions {
  initialText?: string;
  onSubmit?: (text: string) => void;
}

export interface TextBufferActions {
  setText: (text: string) => void;
  insertChar: (char: string) => void;
  deleteChar: () => void;
  deleteCharForward: () => void;
  moveCursorLeft: () => void;
  moveCursorRight: () => void;
  moveCursorUp: () => void;
  moveCursorDown: () => void;
  moveCursorToStart: () => void;
  moveCursorToEnd: () => void;
  clear: () => void;
}

export function useTextBuffer(options: UseTextBufferOptions = {}): TextBufferState & TextBufferActions {
  const { initialText = '' } = options;
  
  const [text, setTextState] = useState(initialText);
  const [cursorPosition, setCursorPosition] = useState(initialText.length);
  
  // 计算行和列
  const lines = text.split('\n');
  let pos = 0;
  let cursorRow = 0;
  let cursorCol = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length;
    if (pos + lineLength >= cursorPosition) {
      cursorRow = i;
      cursorCol = cursorPosition - pos;
      break;
    }
    pos += lineLength + 1; // +1 for newline
  }
  
  const setText = useCallback((newText: string) => {
    setTextState(newText);
    setCursorPosition(newText.length);
  }, []);
  
  const insertChar = useCallback((char: string) => {
    setCursorPosition(pos => {
      setTextState(prev => prev.slice(0, pos) + char + prev.slice(pos));
      return pos + char.length;
    });
  }, []);
  
  const deleteChar = useCallback(() => {
    setCursorPosition(pos => {
      if (pos > 0) {
        setTextState(prev => prev.slice(0, pos - 1) + prev.slice(pos));
        return pos - 1;
      }
      return pos;
    });
  }, []);
  
  const deleteCharForward = useCallback(() => {
    setCursorPosition(pos => {
      setTextState(prev => {
        if (pos < prev.length) {
          return prev.slice(0, pos) + prev.slice(pos + 1);
        }
        return prev;
      });
      return pos;  // 光标位置不变
    });
  }, []);
  
  const moveCursorLeft = useCallback(() => {
    setCursorPosition(pos => Math.max(0, pos - 1));
  }, []);
  
  const moveCursorRight = useCallback(() => {
    setCursorPosition(pos => Math.min(text.length, pos + 1));
  }, [text.length]);
  
  const moveCursorUp = useCallback(() => {
    if (cursorRow > 0) {
      const prevLineStart = text.lastIndexOf('\n', cursorPosition - cursorCol - 2) + 1;
      const prevLineLength = lines[cursorRow - 1].length;
      const newCol = Math.min(cursorCol, prevLineLength);
      setCursorPosition(prevLineStart + newCol);
    }
  }, [cursorRow, cursorCol, cursorPosition, text, lines]);
  
  const moveCursorDown = useCallback(() => {
    if (cursorRow < lines.length - 1) {
      const nextLineStart = text.indexOf('\n', cursorPosition - cursorCol) + 1;
      const nextLineLength = lines[cursorRow + 1].length;
      const newCol = Math.min(cursorCol, nextLineLength);
      setCursorPosition(nextLineStart + newCol);
    }
  }, [cursorRow, cursorCol, cursorPosition, text, lines]);
  
  const moveCursorToStart = useCallback(() => {
    setCursorPosition(0);
  }, []);
  
  const moveCursorToEnd = useCallback(() => {
    setCursorPosition(text.length);
  }, [text.length]);
  
  const clear = useCallback(() => {
    setTextState('');
    setCursorPosition(0);
  }, []);
  
  return {
    text,
    cursorPosition,
    lines,
    cursorRow,
    cursorCol,
    setText,
    insertChar,
    deleteChar,
    deleteCharForward,
    moveCursorLeft,
    moveCursorRight,
    moveCursorUp,
    moveCursorDown,
    moveCursorToStart,
    moveCursorToEnd,
    clear,
  };
}
