'use client';

import { useState } from 'react';
import { Session } from '@/app/lib/session/storage';

interface SessionPanelProps {
  sessions: Session[];
  activeSessionId: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onRenameSession: (sessionId: string, newName: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

export default function SessionPanel({
  sessions,
  activeSessionId,
  isOpen,
  onToggle,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
}: SessionPanelProps) {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleStartEdit = (session: Session) => {
    setEditingSessionId(session.id);
    setEditName(session.name);
  };

  const handleSaveEdit = (sessionId: string) => {
    if (editName.trim()) {
      onRenameSession(sessionId, editName.trim());
    }
    setEditingSessionId(null);
  };

  const handleCancelEdit = () => {
    setEditingSessionId(null);
    setEditName('');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Sort sessions by last updated (most recent first)
  const sortedSessions = [...sessions].sort((a, b) => 
    new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  );

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Side Panel */}
      <div
        className={`fixed left-0 top-0 h-full bg-white border-r border-[#87776B]/20 shadow-2xl z-50 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } w-80`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#87776B]/20">
            <h2 className="text-lg font-semibold text-[#393A46]">Sessions</h2>
            <button
              onClick={onToggle}
              className="p-2 hover:bg-[#87776B]/10 rounded-lg transition"
              title="Close panel"
            >
              <svg className="w-5 h-5 text-[#393A46]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* New Session Button */}
          <div className="p-4 border-b border-[#87776B]/20">
            <button
              onClick={onNewSession}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#98B1D3] text-white rounded-xl hover:bg-[#87a5c2] transition shadow-md"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="font-semibold">New Session</span>
            </button>
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto p-2">
            {sortedSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <p className="text-sm text-[#87776B] mb-4">No sessions yet</p>
                <button
                  onClick={onNewSession}
                  className="text-sm text-[#98B1D3] hover:underline"
                >
                  Create your first session
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedSessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  const isEditing = editingSessionId === session.id;

                  return (
                    <div
                      key={session.id}
                      className={`group relative rounded-xl p-3 cursor-pointer transition ${
                        isActive
                          ? 'bg-[#98B1D3]/20 border-2 border-[#98B1D3]'
                          : 'bg-[#F2F1F0]/50 border-2 border-transparent hover:border-[#87776B]/30'
                      }`}
                      onClick={() => !isEditing && onSelectSession(session.id)}
                    >
                      {isEditing ? (
                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(session.id);
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            className="w-full px-2 py-1 text-sm border border-[#98B1D3] rounded focus:outline-none focus:ring-2 focus:ring-[#98B1D3]"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveEdit(session.id)}
                              className="flex-1 px-2 py-1 text-xs bg-[#4CB49C] text-white rounded hover:bg-[#45a088] transition"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="flex-1 px-2 py-1 text-xs border border-[#87776B]/30 text-[#393A46] rounded hover:bg-[#87776B]/10 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="text-sm font-medium text-[#393A46] line-clamp-2 flex-1">
                              {session.name}
                            </h3>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEdit(session);
                                }}
                                className="p-1 hover:bg-white/50 rounded transition"
                                title="Rename"
                              >
                                <svg className="w-3.5 h-3.5 text-[#393A46]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm('Delete this session?')) {
                                    onDeleteSession(session.id);
                                  }
                                }}
                                className="p-1 hover:bg-[#c73f32]/10 rounded transition"
                                title="Delete"
                              >
                                <svg className="w-3.5 h-3.5 text-[#c73f32]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs text-[#87776B]">
                            <span>{session.messageCount} messages</span>
                            <span>{formatDate(session.lastUpdated)}</span>
                          </div>

                          {isActive && (
                            <div className="absolute top-2 right-2">
                              <div className="w-2 h-2 rounded-full bg-[#4CB49C]"></div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[#87776B]/20">
            <p className="text-xs text-[#87776B] text-center">
              {sessions.length} / 50 sessions
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

