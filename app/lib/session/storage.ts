/**
 * Session storage utilities using localStorage
 */

import { ChatMessage, ChatResponse, AnalysisSnapshot } from '@/app/types/database';

export interface Session {
  id: string;
  name: string;
  createdAt: string;
  lastUpdated: string;
  messages: ChatMessage[];
  analysisHistory: AnalysisSnapshot[];
  messageCount: number;
}

export interface SessionsData {
  sessions: Session[];
  activeSessionId: string | null;
  lastUpdated: string;
}

const STORAGE_KEY = 'kudu_sessions';
const MAX_SESSIONS = 50;

/**
 * Load all sessions from localStorage
 */
export function loadSessions(): SessionsData {
  if (typeof window === 'undefined') {
    return { sessions: [], activeSessionId: null, lastUpdated: new Date().toISOString() };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { sessions: [], activeSessionId: null, lastUpdated: new Date().toISOString() };
    }

    const data = JSON.parse(stored) as SessionsData;
    return data;
  } catch (error) {
    console.error('Failed to load sessions:', error);
    return { sessions: [], activeSessionId: null, lastUpdated: new Date().toISOString() };
  }
}

/**
 * Save sessions to localStorage
 */
export function saveSessions(data: SessionsData): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const serialized = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch (error) {
    console.error('Failed to save sessions:', error);
    return false;
  }
}

/**
 * Create a new session
 */
export function createSession(name?: string): Session {
  const now = new Date().toISOString();
  const defaultName = `Session ${new Date().toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    hour: 'numeric', 
    minute: '2-digit' 
  })}`;

  return {
    id: crypto.randomUUID(),
    name: name || defaultName,
    createdAt: now,
    lastUpdated: now,
    messages: [],
    analysisHistory: [],
    messageCount: 0,
  };
}

/**
 * Add a new session
 */
export function addSession(session: Session): boolean {
  const data = loadSessions();

  // Check if we've reached the limit
  if (data.sessions.length >= MAX_SESSIONS) {
    // Remove oldest session
    data.sessions.sort((a, b) => new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime());
    data.sessions.shift();
  }

  data.sessions.push(session);
  data.activeSessionId = session.id;
  data.lastUpdated = new Date().toISOString();

  return saveSessions(data);
}

/**
 * Update an existing session
 */
export function updateSession(
  sessionId: string,
  updates: Partial<Omit<Session, 'id' | 'createdAt'>>
): boolean {
  const data = loadSessions();
  const sessionIndex = data.sessions.findIndex(s => s.id === sessionId);

  if (sessionIndex === -1) return false;

  data.sessions[sessionIndex] = {
    ...data.sessions[sessionIndex],
    ...updates,
    lastUpdated: new Date().toISOString(),
  };

  data.lastUpdated = new Date().toISOString();
  return saveSessions(data);
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
  const data = loadSessions();
  const initialLength = data.sessions.length;

  data.sessions = data.sessions.filter(s => s.id !== sessionId);

  if (data.sessions.length === initialLength) return false;

  // If we deleted the active session, set a new active session
  if (data.activeSessionId === sessionId) {
    data.activeSessionId = data.sessions.length > 0 ? data.sessions[data.sessions.length - 1].id : null;
  }

  data.lastUpdated = new Date().toISOString();
  return saveSessions(data);
}

/**
 * Get a session by ID
 */
export function getSession(sessionId: string): Session | null {
  const data = loadSessions();
  return data.sessions.find(s => s.id === sessionId) || null;
}

/**
 * Set active session
 */
export function setActiveSession(sessionId: string): boolean {
  const data = loadSessions();
  
  if (!data.sessions.find(s => s.id === sessionId)) {
    return false;
  }

  data.activeSessionId = sessionId;
  data.lastUpdated = new Date().toISOString();
  return saveSessions(data);
}

/**
 * Get active session
 */
export function getActiveSession(): Session | null {
  const data = loadSessions();
  
  if (!data.activeSessionId) return null;
  
  return data.sessions.find(s => s.id === data.activeSessionId) || null;
}

/**
 * Rename a session
 */
export function renameSession(sessionId: string, newName: string): boolean {
  return updateSession(sessionId, { name: newName.trim() });
}

/**
 * Get all sessions sorted by last updated
 */
export function getAllSessions(): Session[] {
  const data = loadSessions();
  return [...data.sessions].sort((a, b) => 
    new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  );
}

/**
 * Clear all sessions
 */
export function clearAllSessions(): boolean {
  const data: SessionsData = {
    sessions: [],
    activeSessionId: null,
    lastUpdated: new Date().toISOString(),
  };
  
  return saveSessions(data);
}

/**
 * Export sessions as JSON
 */
export function exportSessions(): string {
  const data = loadSessions();
  return JSON.stringify(data, null, 2);
}

/**
 * Import sessions from JSON
 */
export function importSessions(jsonString: string): boolean {
  try {
    const data = JSON.parse(jsonString) as SessionsData;
    
    if (!data.sessions || !Array.isArray(data.sessions)) {
      throw new Error('Invalid sessions format');
    }
    
    return saveSessions(data);
  } catch (error) {
    console.error('Failed to import sessions:', error);
    return false;
  }
}
