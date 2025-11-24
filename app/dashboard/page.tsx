'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import DashboardCard from '../components/DashboardCard';
import {
  loadDashboard,
  removeDashboardItem,
  updateDashboardItem,
  markItemRefreshed,
  DashboardItem,
} from '../lib/dashboard/storage';
import { QueryResult } from '../types/database';

export default function DashboardPage() {
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load dashboard on mount
    const dashboard = loadDashboard();
    setItems(dashboard.items);
    setIsLoading(false);
  }, []);

  const handleRemove = useCallback((itemId: string) => {
    const success = removeDashboardItem(itemId);
    if (success) {
      setItems(prevItems => prevItems.filter(item => item.id !== itemId));
    }
  }, []);

  const handleRefresh = useCallback(async (itemId: string): Promise<QueryResult | null> => {
    const item = items.find(i => i.id === itemId);
    if (!item) return null;

    try {
      // Execute the SQL query
      const response = await fetch('/api/execute-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sqlQuery: item.sqlQuery }),
      });

      if (!response.ok) {
        throw new Error('Failed to execute query');
      }

      const data = await response.json();
      
      // Mark as refreshed
      markItemRefreshed(itemId);
      
      // Update local state
      setItems(prevItems =>
        prevItems.map(i =>
          i.id === itemId
            ? { ...i, lastRefreshed: new Date().toISOString() }
            : i
        )
      );

      return data.result;
    } catch (error) {
      console.error('Failed to refresh dashboard item:', error);
      throw error;
    }
  }, [items]);

  const handleTitleEdit = useCallback((itemId: string, newTitle: string) => {
    const success = updateDashboardItem(itemId, { title: newTitle });
    if (success) {
      setItems(prevItems =>
        prevItems.map(item =>
          item.id === itemId ? { ...item, title: newTitle } : item
        )
      );
    }
  }, []);

  const handleRefreshAll = async () => {
    for (const item of items) {
      try {
        await handleRefresh(item.id);
      } catch (error) {
        console.error(`Failed to refresh ${item.title}:`, error);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F2F1F0] flex items-center justify-center">
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
          <p className="text-sm text-[#87776B]">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F1F0] text-[#393A46]">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(152,177,211,0.12)_0%,transparent_60%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-[#87776B] hover:text-[#393A46] transition mb-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Chat
            </Link>
            <h1 className="text-3xl font-bold text-[#393A46]">Dashboard</h1>
            <p className="text-sm text-[#87776B] mt-1">
              Saved visualizations ({items.length})
            </p>
          </div>

          {items.length > 0 && (
            <button
              onClick={handleRefreshAll}
              className="rounded-2xl bg-[#4CB49C] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#4CB49C]/30 transition hover:bg-[#45a088] flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh All
            </button>
          )}
        </div>

        {/* Dashboard Grid */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="rounded-full bg-[#98B1D3]/20 p-6 mb-6">
              <svg
                className="w-16 h-16 text-[#98B1D3]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-[#393A46] mb-2">No saved visualizations yet</h2>
            <p className="text-sm text-[#87776B] text-center max-w-md mb-6">
              Save your favorite charts from the main chat to access them here quickly
            </p>
            <Link
              href="/"
              className="rounded-2xl bg-[#98B1D3] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#98B1D3]/30 transition hover:bg-[#87a5c2]"
            >
              Go to Chat
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {items.map(item => (
              <DashboardCard
                key={item.id}
                item={item}
                onRemove={handleRemove}
                onRefresh={handleRefresh}
                onTitleEdit={handleTitleEdit}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


