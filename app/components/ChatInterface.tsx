'use client';

import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '@/app/types/database';

interface ChatInterfaceProps {
  onSendMessage: (message: string) => Promise<void>;
  messages: ChatMessage[];
  isLoading: boolean;
  checkpointMessageIds?: string[];
  onJumpToCheckpoint?: (messageId: string) => void;
}

export default function ChatInterface({ 
  onSendMessage, 
  messages, 
  isLoading, 
  checkpointMessageIds = [],
  onJumpToCheckpoint 
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(messages.length);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  const scrollToBottom = (smooth: boolean = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  // Check if user is near bottom of scroll
  const isNearBottom = () => {
    if (!messagesContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    return scrollHeight - scrollTop - clientHeight < 100;
  };

  // Handle scroll to detect if user is scrolling up
  const handleScroll = () => {
    setShouldAutoScroll(isNearBottom());
  };

  // Only auto-scroll when new messages arrive AND user is near bottom
  useEffect(() => {
    const hasNewMessages = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (hasNewMessages && shouldAutoScroll) {
      // Small delay to ensure DOM is updated
      setTimeout(() => scrollToBottom(true), 100);
    }
  }, [messages, shouldAutoScroll]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput('');
    await onSendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-[28px] bg-white/80 p-3">
      {/* Messages Area */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 space-y-4 overflow-y-auto rounded-2xl bg-white/70 p-5 shadow-inner shadow-[#98b1d324] no-scrollbar"
      >
        {messages.length === 0 && (
          <div className="mt-8 text-center text-[#87776B]">
            <p className="mb-2 text-lg font-medium text-[#393A46]">Ask a question about your data</p>
            <p className="text-sm">Try: &quot;Show me the top 10 customers by revenue&quot;</p>
          </div>
        )}
        
        {messages.map((message) => {
          const isCheckpoint = checkpointMessageIds.includes(message.id);
          const isClickable = isCheckpoint && onJumpToCheckpoint;
          
          return (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow relative ${
                  message.role === 'user'
                    ? 'border-[#98B1D3]/60 bg-[#98B1D3] text-[#393A46] shadow-[#98B1D380]'
                    : 'border-[#87776B]/30 bg-[#F2F1F0] text-[#393A46] shadow-[#c6a17e33]'
                } ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-[#F3C32B]/50 transition-shadow' : ''}`}
                onClick={() => isClickable && onJumpToCheckpoint(message.id)}
                title={isCheckpoint ? 'Click to view this analysis' : undefined}
              >
                {isCheckpoint && (
                  <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#F3C32B] border-2 border-white shadow-md flex items-center justify-center">
                    <span className="text-[10px]">📊</span>
                  </div>
                )}
                <p className="whitespace-pre-wrap">{message.content}</p>
              
              {message.sqlQuery && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-[#87776B]">
                    View SQL Query
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-[#393A46]/10 p-2 text-[11px] text-[#393A46]">
                    <code>{message.sqlQuery}</code>
                  </pre>
                </details>
              )}
              
              {message.error && (
                <div className="mt-2 text-xs text-[#c73f32]">
                  Error: {message.error}
                </div>
              )}
              </div>
            </div>
          );
        })}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-[#C6A17E]/20 px-4 py-2 text-[#393A46]">
              <div className="flex space-x-2">
                <div className="h-2 w-2 animate-bounce rounded-full bg-[#98B1D3]"></div>
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-[#4CB49C]"
                  style={{ animationDelay: '0.2s' }}
                ></div>
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-[#F3C32B]"
                  style={{ animationDelay: '0.4s' }}
                ></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="bg-white/80 p-4 surface">
        <div className="flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your data..."
            disabled={isLoading}
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-[#87776B]/40 bg-white px-4 py-3 text-sm text-[#393A46] placeholder:text-[#87776B] focus:outline-none focus:ring-2 focus:ring-[#98B1D3] disabled:opacity-50"
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="rounded-2xl bg-[#98B1D3] px-6 py-3 text-sm font-semibold text-[#393A46] shadow-lg shadow-[#98B1D36b] transition hover:bg-[#8aa5c6] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

