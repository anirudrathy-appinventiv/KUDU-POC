'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ChatInterface from './components/ChatInterface';
import QueryResults from './components/QueryResults';
import SessionSidebar from './components/SessionSidebar';
import { ChatMessage, ChatResponse, AnalysisSnapshot } from './types/database';
import {
  loadSessions,
  createSession,
  addSession,
  updateSession,
  deleteSession,
  renameSession as renameSessionInStorage,
  setActiveSession,
  getSession,
  getAllSessions,
  Session,
} from './lib/session/storage';

export default function Home() {
  // Session state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Current session state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentResult, setCurrentResult] = useState<ChatResponse | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  
  // History navigation state
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisSnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isViewingHistory, setIsViewingHistory] = useState(false);
  const [currentUserQuery, setCurrentUserQuery] = useState<string>('');

  // Initialize sessions on mount
  useEffect(() => {
    const sessionsData = loadSessions();
    
    if (sessionsData.sessions.length === 0) {
      // Create first session
      const newSession = createSession();
      addSession(newSession);
      setSessions([newSession]);
      setActiveSessionId(newSession.id);
    } else {
      setSessions(sessionsData.sessions);
      const activeId = sessionsData.activeSessionId || sessionsData.sessions[0].id;
      setActiveSessionId(activeId);
      
      // Load active session data
      const activeSession = getSession(activeId);
      if (activeSession) {
        setMessages(activeSession.messages);
        setAnalysisHistory(activeSession.analysisHistory);
      }
    }
  }, []);

  // Save session data whenever it changes
  useEffect(() => {
    if (activeSessionId && messages.length > 0) {
      updateSession(activeSessionId, {
        messages,
        analysisHistory,
        messageCount: messages.length,
      });
    }
  }, [messages, analysisHistory, activeSessionId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const toPlainHistory = useCallback((history: ChatMessage[]) => {
    return history.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
      sqlQuery: (m as any).sqlQuery,
      queryResult: (m as any).queryResult,
      summary: (m as any).summary,
      error: (m as any).error,
      visualizationPlan: (m as any).visualizationPlan,
      topResults: (m as any).topResults,
    }));
  }, []);

  const sendChatRequest = useCallback(
    async (userMessage: string, history: ChatMessage[]) => {
      const conversationHistory = toPlainHistory(history.slice(0, -1));

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage,
            conversationHistory,
          }),
        });

        let dataJson: any = null;
        try {
          dataJson = await res.json();
        } catch (parseErr) {
          const txt = await res.text();
          throw new Error(`Server returned non-JSON response: ${txt}`);
        }

        if (!res.ok) {
          const errMsg = dataJson?.error || dataJson?.message || 'Failed to process query';
          throw new Error(errMsg);
        }

        const data: ChatResponse = dataJson as ChatResponse;

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.message ?? '',
          timestamp: new Date(),
          sqlQuery: data.sqlQuery,
          queryResult: (data as any).result,
          summary: data.summary,
          visualizationPlan: data.visualizationPlan,
          topResults: data.result && data.result.rows.length > 0 && data.result.columns.length > 0
            ? data.result.rows.slice(0, 3).map(row => String(row[data.result!.columns[0]] || '')).filter(Boolean)
            : undefined,
        };

        setMessages((cur) => {
          const exists = cur.some((msg) => msg.id === assistantMsg.id);
          return exists ? cur : [...cur, assistantMsg];
        });

        if (data.result) {
          setCurrentResult(data);
          setCurrentUserQuery(userMessage);
          
          // Save to analysis history
          const snapshot: AnalysisSnapshot = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            userQuery: userMessage,
            chatResponse: data,
            messageId: assistantMsg.id,
          };
          
          setAnalysisHistory(prev => {
            const newHistory = [...prev, snapshot];
            return newHistory.slice(-50);
          });
          
          // Reset to latest view
          setIsViewingHistory(false);
          setHistoryIndex(-1);
        } else {
          setCurrentResult(null);
        }
      } catch (error: any) {
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your query.',
          timestamp: new Date(),
          error: error?.message || 'Unknown error',
        };

        setMessages((cur) => {
          const exists = cur.some((msg) => msg.id === errorMsg.id);
          return exists ? cur : [...cur, errorMsg];
        });

        console.error('chat error', error);
      }
    },
    [toPlainHistory]
  );

  const handleSendMessage = useCallback(
    async (userMessage: string) => {
      const trimmedMessage = userMessage.trim();
      if (!trimmedMessage) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmedMessage,
        timestamp: new Date(),
      };

      setIsLoading(true);
      setCurrentResult(null);

      const updatedHistory = [...messagesRef.current, userMsg];
      messagesRef.current = updatedHistory;
      setMessages(updatedHistory);

      try {
        await sendChatRequest(trimmedMessage, updatedHistory);
      } finally {
        setIsLoading(false);
      }
    },
    [sendChatRequest]
  );

  // History navigation functions
  const navigateBackward = useCallback(() => {
    if (analysisHistory.length === 0) return;
    
    const newIndex = isViewingHistory 
      ? Math.max(0, historyIndex - 1)
      : analysisHistory.length - 1;
    
    const snapshot = analysisHistory[newIndex];
    if (snapshot) {
      setHistoryIndex(newIndex);
      setIsViewingHistory(true);
      setCurrentResult(snapshot.chatResponse);
    }
  }, [analysisHistory, historyIndex, isViewingHistory]);

  const navigateForward = useCallback(() => {
    if (!isViewingHistory || historyIndex >= analysisHistory.length - 1) {
      setIsViewingHistory(false);
      setHistoryIndex(-1);
      if (analysisHistory.length > 0) {
        const latest = analysisHistory[analysisHistory.length - 1];
        setCurrentResult(latest.chatResponse);
      }
      return;
    }
    
    const newIndex = historyIndex + 1;
    const snapshot = analysisHistory[newIndex];
    
    if (snapshot) {
      setHistoryIndex(newIndex);
      setCurrentResult(snapshot.chatResponse);
      
      if (newIndex === analysisHistory.length - 1) {
        setIsViewingHistory(false);
      }
    }
  }, [analysisHistory, historyIndex, isViewingHistory]);

  const jumpToSnapshot = useCallback((snapshotId: string) => {
    const index = analysisHistory.findIndex(s => s.messageId === snapshotId);
    if (index !== -1) {
      const snapshot = analysisHistory[index];
      setHistoryIndex(index);
      setIsViewingHistory(index !== analysisHistory.length - 1);
      setCurrentResult(snapshot.chatResponse);
    }
  }, [analysisHistory]);

  // Session management functions
  const handleNewSession = useCallback(() => {
    const newSession = createSession();
    addSession(newSession);
    setSessions(getAllSessions());
    setActiveSessionId(newSession.id);
    setActiveSession(newSession.id);
    
    // Clear current session data
    setMessages([]);
    setAnalysisHistory([]);
    setCurrentResult(null);
    setHistoryIndex(-1);
    setIsViewingHistory(false);
    setCurrentUserQuery('');
  }, []);

  const handleSelectSession = useCallback((sessionId: string) => {
    const session = getSession(sessionId);
    if (!session) return;
    
    setActiveSessionId(sessionId);
    setActiveSession(sessionId);
    
    // Load session data
    setMessages(session.messages);
    setAnalysisHistory(session.analysisHistory);
    setCurrentResult(null);
    setHistoryIndex(-1);
    setIsViewingHistory(false);
    setCurrentUserQuery('');
  }, []);

  const handleRenameSession = useCallback((sessionId: string, newName: string) => {
    renameSessionInStorage(sessionId, newName);
    setSessions(getAllSessions());
  }, []);

  const handleDeleteSession = useCallback((sessionId: string) => {
    const success = deleteSession(sessionId);
    if (success) {
      const updatedSessions = getAllSessions();
      setSessions(updatedSessions);
      
      // If we deleted the active session, switch to another
      if (sessionId === activeSessionId) {
        if (updatedSessions.length > 0) {
          handleSelectSession(updatedSessions[0].id);
        } else {
          handleNewSession();
        }
      }
    }
  }, [activeSessionId, handleSelectSession, handleNewSession]);

  return (
    <div
      className="relative min-h-screen min-w-20xl overflow-hidden bg-[var(--color-bg, #F2F1F0)] text-[var(--color-foreground, #393A46)]"
      style={
        {
          ['--color-card' as any]: '#FFFFFF',
          ['--color-card-dark' as any]: '#393A46',
          ['--color-card-dark-text' as any]: '#F2F1F0',
        } as React.CSSProperties
      }
    >
      {/* Session Sidebar */}
      <SessionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
      />

      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(152,177,211,0.12)_0%,transparent_60%)]"
        aria-hidden
      />

      <div className="relative mx-auto flex max-w-[85vw] flex-col gap-10 px-4 py-8 min-h-screen">
        {/* Header with Session Toggle and Navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Sidebar Toggle Button */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-[#98B1D3]/10 rounded-lg transition"
              title="Open Sessions"
            >
              <svg className="w-6 h-6 text-[#393A46]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div>
              <h1 className="text-2xl font-semibold text-[#393A46]">KUDU Data Analysis Assistant</h1>
              <p className="text-sm text-[#87776B] mt-1">Your intelligent business insights platform</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* History Navigation */}
            {analysisHistory.length > 0 && (
              <div className="flex items-center gap-2 rounded-2xl bg-white/80 border border-[#87776B]/20 px-3 py-2 shadow-md">
                <button
                  onClick={navigateBackward}
                  disabled={analysisHistory.length === 0}
                  className="p-1.5 rounded-lg hover:bg-[#98B1D3]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Previous Analysis"
                >
                  <svg className="w-5 h-5 text-[#393A46]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                
                <span className="text-xs font-medium text-[#87776B] min-w-[60px] text-center">
                  {isViewingHistory 
                    ? `${historyIndex + 1} / ${analysisHistory.length}`
                    : `${analysisHistory.length} saved`}
                </span>
                
                <button
                  onClick={navigateForward}
                  disabled={!isViewingHistory}
                  className="p-1.5 rounded-lg hover:bg-[#98B1D3]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Next Analysis"
                >
                  <svg className="w-5 h-5 text-[#393A46]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <a
                href="/dashboard"
                className="rounded-2xl bg-[#98B1D3] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#98B1D3]/30 transition hover:bg-[#87a5c2] flex items-center gap-2"
              >
                Dashboard
              </a>
              <a
                href="/test-connection"
                className="rounded-2xl bg-[#4CB49C] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#4CB49C]/30 transition hover:bg-[#45a088]"
              >
                Query Runner
              </a>
            </div>
          </div>
        </div>
        
        
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="surface lg:col-span-1">
            <div className="flex h-[min(72vh,720px)] flex-col overflow-hidden">
              <div className="px-6 py-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-[#393A46]">Chat</h3>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-6">
                <ChatInterface 
                  onSendMessage={handleSendMessage} 
                  messages={messages} 
                  isLoading={isLoading}
                  checkpointMessageIds={analysisHistory.map(s => s.messageId)}
                  onJumpToCheckpoint={jumpToSnapshot}
                />
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-[#87776B]/30 bg-(--color-card-dark) text-(--color-card-dark-text) shadow-2xl shadow-[#393a4626] lg:col-span-2">
            <div className="flex h-[min(72vh,720px)] flex-col overflow-hidden px-6 py-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-(--color-card-dark-text)">Results</h3>
              </div>

              <div className="flex-1 overflow-y-auto">
                {currentResult && currentResult.result ? (
                  <QueryResults 
                    result={currentResult.result} 
                    summary={currentResult.summary}
                    visualizationPlan={currentResult.visualizationPlan}
                    sqlQuery={currentResult.sqlQuery}
                    userQuery={isViewingHistory 
                      ? analysisHistory[historyIndex]?.userQuery 
                      : currentUserQuery}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-[#F2F1F0]/70">
                    <div className="rounded-full border border-[#FCE457]/40 px-3 py-1 text-xs uppercase tracking-wide text-[#FCE457]">
                      Awaiting query
                    </div>
                    <p className="text-lg font-medium text-(--color-card-dark-text)">No results yet</p>
                    <p className="text-sm text-[#F2F1F0]/80 px-6 text-center">Ask a question to see data, summaries, and charts here.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
