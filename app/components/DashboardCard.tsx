'use client';

import { useState, useEffect } from 'react';
import { DashboardItem } from '@/app/lib/dashboard/storage';
import { QueryResult } from '@/app/types/database';
import ChartRenderer from './ChartRenderer';

interface DashboardCardProps {
  item: DashboardItem;
  onRemove: (id: string) => void;
  onRefresh: (id: string) => Promise<QueryResult | null>;
  onTitleEdit: (id: string, newTitle: string) => void;
}

export default function DashboardCard({ item, onRemove, onRefresh, onTitleEdit }: DashboardCardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(item.title);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await onRefresh(item.id);
      if (result) {
        setQueryResult(result);
      } else {
        setError('No data returned');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const result = await onRefresh(item.id);
      if (result) {
        setQueryResult(result);
      } else {
        setError('No data returned');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTitleSave = () => {
    if (editedTitle.trim() && editedTitle !== item.title) {
      onTitleEdit(item.id, editedTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setEditedTitle(item.title);
    setIsEditingTitle(false);
  };

  const getTimeSince = (dateString?: string) => {
    if (!dateString) return 'Never';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className="rounded-2xl border border-[#87776B]/20 shadow-lg p-5 flex flex-col bg-[#393A46]">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleSave();
                  if (e.key === 'Escape') handleTitleCancel();
                }}
                className="flex-1 px-2 py-1 text-sm font-semibold text-[#ffffff] border border-[#98B1D3] rounded focus:outline-none focus:ring-2 focus:ring-[#98B1D3]"
                autoFocus
              />
              <button
                onClick={handleTitleSave}
                className="p-1 text-white hover:bg-[#4CB49C]/10 rounded transition"
                title="Save"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                onClick={handleTitleCancel}
                className="p-1 text-white hover:bg-[#87776B]/10 rounded transition"
                title="Cancel"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <h3
              className="text-base font-semibold text-white truncate cursor-pointer hover:text-[#98B1D3] transition"
              onClick={() => setIsEditingTitle(true)}
              title="Click to edit title"
            >
              {item.title}
            </h3>
          )}
          <p className="text-xs text-white mt-1 truncate" title={item.userQuery}>
            {item.userQuery}
          </p>
        </div>

        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="p-1.5 text-[#4CB49C] hover:bg-[#4CB49C]/10 rounded-lg transition disabled:opacity-30"
            title="Refresh data"
          >
            <svg
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          <button
            onClick={() => onRemove(item.id)}
            className="p-1.5 text-[#c73f32] hover:bg-[#c73f32]/10 rounded-lg transition"
            title="Remove from dashboard"
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
      </div>

      {/* Chart Area */}
      <div className="flex-1 min-h-[250px] mb-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="flex space-x-2">
                <div className="h-3 w-3 animate-bounce rounded-full bg-[#98B1D3]"></div>
                <div
                  className="h-3 w-3 animate-bounce rounded-full bg-[#4CB49C]"
                  style={{ animationDelay: '0.2s' }}
                ></div>
                <div
                  className="h-3 w-3 animate-bounce rounded-full bg-[#F3C32B]"
                  style={{ animationDelay: '0.4s' }}
                ></div>
              </div>
              <p className="text-sm text-white">Loading data...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-sm text-[#c73f32] mb-2">⚠️ {error}</p>
              <button
                onClick={loadData}
                className="px-4 py-2 text-xs bg-[#98B1D3] text-white rounded-lg hover:bg-[#87a5c2] transition"
              >
                Retry
              </button>
            </div>
          </div>
        ) : queryResult ? (
          <ChartRenderer data={queryResult} plan={item.visualizationPlan} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-[#87776B]">
            No data available
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-white pt-3 border-t border-[#87776B]/10">
        <span>
          Last refreshed: {getTimeSince(item.lastRefreshed || item.createdAt)}
        </span>
        {queryResult && (
          <span>
            {queryResult.rowCount.toLocaleString()} rows
          </span>
        )}
      </div>
    </div>
  );
}


