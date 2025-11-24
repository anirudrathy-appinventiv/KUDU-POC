'use client';

import { useState } from 'react';
import { Session } from '@/app/lib/session/storage';

interface SessionSidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onRenameSession: (sessionId: string, newName: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

export default function SessionSidebar({
  sessions,
  activeSessionId,
  isOpen,
  onClose,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
}: SessionSidebarProps) {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');

  const handleRenameStart = (session: Session) => {
    setEditingSessionId(session.id);
    setEditedName(session.name);
  };

  const handleRenameSave = (sessionId: string) => {
    if (editedName.trim()) {
      onRenameSession(sessionId, editedName.trim());
    }
    setEditingSessionId(null);
  };

  const handleRenameCancel = () => {
    setEditingSessionId(null);
    setEditedName('');
  };

  const getTimeSince = (dateString: string) => {
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

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full w-80 bg-[#F2F1F0] shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } flex flex-col`}
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#87776B]/20">
          <div>
            <h2 className="text-lg font-semibold text-[#393A46]">Sessions</h2>
            <p className="text-xs text-[#87776B] mt-0.5">{sessions.length} total</p>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-2 hover:bg-[#87776B]/10 rounded-lg transition"
          >
            <svg className="w-5 h-5 text-[#393A46]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New Session Button */}
        <div className="p-4 border-b border-[#87776B]/20">
          <button
            onClick={() => {
              onNewSession();
              onClose();
            }}
            className="w-full px-4 py-3 bg-[#4CB49C] text-white rounded-xl font-semibold hover:bg-[#45a088] transition shadow-md flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Session
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sessions.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-sm text-[#87776B]">No sessions yet</p>
              <p className="text-xs text-[#87776B] mt-1">Create one to get started</p>
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const isEditing = editingSessionId === session.id;

              return (
                <div
                  key={session.id}
                  className={`group rounded-xl p-3 transition cursor-pointer ${
                    isActive
                      ? 'bg-[#98B1D3] shadow-md'
                      : 'bg-white hover:bg-[#98B1D3]/10 border border-[#87776B]/10'
                  }`}
                  onClick={() => {
                    if (!isEditing) {
                      onSelectSession(session.id);
                      onClose();
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedName}
                          onChange={(e) => setEditedName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameSave(session.id);
                            if (e.key === 'Escape') handleRenameCancel();
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1 text-sm font-medium bg-white border border-[#98B1D3] rounded focus:outline-none focus:ring-2 focus:ring-[#98B1D3]"
                          autoFocus
                        />
                      ) : (
                        <h3
                          className={`text-sm font-medium truncate ${
                            isActive ? 'text-white' : 'text-[#393A46]'
                          }`}
                        >
                          {session.name}
                        </h3>
                      )}
                      
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`text-xs ${
                            isActive ? 'text-white/80' : 'text-[#87776B]'
                          }`}
                        >
                          {session.messageCount} messages
                        </span>
                        <span
                          className={`text-xs ${
                            isActive ? 'text-white/70' : 'text-[#87776B]'
                          }`}
                        >
                          • {getTimeSince(session.lastUpdated)}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {!isEditing && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenameStart(session);
                          }}
                          className={`p-1 rounded hover:bg-black/10 transition ${
                            isActive ? 'text-white' : 'text-[#87776B]'
                          }`}
                          title="Rename session"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete "${session.name}"?`)) {
                              onDeleteSession(session.id);
                            }
                          }}
                          className={`p-1 rounded hover:bg-red-500/20 transition ${
                            isActive ? 'text-white hover:text-red-300' : 'text-[#c73f32]'
                          }`}
                          title="Delete session"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    )}

                    {isEditing && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenameSave(session.id);
                          }}
                          className="p-1 text-[#4CB49C] hover:bg-[#4CB49C]/10 rounded transition"
                          title="Save"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenameCancel();
                          }}
                          className="p-1 text-[#87776B] hover:bg-[#87776B]/10 rounded transition"
                          title="Cancel"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#87776B]/20">
          <div className="text-xs text-[#87776B] text-center">
            {sessions.length > 0 && (
              <p>
                Last updated: {new Date(sessions[0]?.lastUpdated || Date.now()).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}


