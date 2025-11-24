/**
 * Dashboard storage utilities using localStorage
 */

import { VisualizationPlan } from '@/app/types/database';

export interface DashboardItem {
  id: string;
  title: string;
  userQuery: string; // Original natural language query
  sqlQuery: string;
  visualizationPlan: VisualizationPlan;
  createdAt: string;
  lastRefreshed?: string;
  order: number;
}

export interface Dashboard {
  items: DashboardItem[];
  lastUpdated: string;
}

const STORAGE_KEY = 'kudu_dashboard';
const MAX_ITEMS = 20; // Maximum number of dashboard items

/**
 * Load dashboard from localStorage
 */
export function loadDashboard(): Dashboard {
  if (typeof window === 'undefined') {
    return { items: [], lastUpdated: new Date().toISOString() };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { items: [], lastUpdated: new Date().toISOString() };
    }

    const dashboard = JSON.parse(stored) as Dashboard;
    return dashboard;
  } catch (error) {
    console.error('Failed to load dashboard:', error);
    return { items: [], lastUpdated: new Date().toISOString() };
  }
}

/**
 * Save dashboard to localStorage
 */
export function saveDashboard(dashboard: Dashboard): boolean {
  if (typeof window === 'undefined') return false;

  try {
    // Check size before saving (localStorage limit ~5-10MB)
    const serialized = JSON.stringify(dashboard);
    const sizeInBytes = new Blob([serialized]).size;
    const sizeInKB = sizeInBytes / 1024;

    if (sizeInKB > 5000) {
      // Over 5MB, too large
      console.error('Dashboard too large to save:', sizeInKB, 'KB');
      return false;
    }

    localStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch (error) {
    console.error('Failed to save dashboard:', error);
    return false;
  }
}

/**
 * Add a new item to the dashboard
 */
export function addDashboardItem(item: Omit<DashboardItem, 'id' | 'order' | 'createdAt'>): DashboardItem | null {
  const dashboard = loadDashboard();

  // Check if we've reached the limit
  if (dashboard.items.length >= MAX_ITEMS) {
    console.error('Dashboard is full. Maximum', MAX_ITEMS, 'items allowed.');
    return null;
  }

  const newItem: DashboardItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    order: dashboard.items.length,
  };

  dashboard.items.push(newItem);
  dashboard.lastUpdated = new Date().toISOString();

  const saved = saveDashboard(dashboard);
  return saved ? newItem : null;
}

/**
 * Remove an item from the dashboard
 */
export function removeDashboardItem(itemId: string): boolean {
  const dashboard = loadDashboard();
  const initialLength = dashboard.items.length;

  dashboard.items = dashboard.items.filter(item => item.id !== itemId);

  if (dashboard.items.length === initialLength) {
    // Item not found
    return false;
  }

  // Reorder items
  dashboard.items.forEach((item, index) => {
    item.order = index;
  });

  dashboard.lastUpdated = new Date().toISOString();
  return saveDashboard(dashboard);
}

/**
 * Update an existing dashboard item
 */
export function updateDashboardItem(itemId: string, updates: Partial<DashboardItem>): boolean {
  const dashboard = loadDashboard();
  const itemIndex = dashboard.items.findIndex(item => item.id === itemId);

  if (itemIndex === -1) {
    return false;
  }

  dashboard.items[itemIndex] = {
    ...dashboard.items[itemIndex],
    ...updates,
    id: itemId, // Ensure ID doesn't change
  };

  dashboard.lastUpdated = new Date().toISOString();
  return saveDashboard(dashboard);
}

/**
 * Update the last refreshed timestamp for an item
 */
export function markItemRefreshed(itemId: string): boolean {
  return updateDashboardItem(itemId, {
    lastRefreshed: new Date().toISOString(),
  });
}

/**
 * Check if an item with the same SQL query already exists
 */
export function isDuplicateQuery(sqlQuery: string): boolean {
  const dashboard = loadDashboard();
  const normalized = sqlQuery.trim().toLowerCase();
  return dashboard.items.some(item => 
    item.sqlQuery.trim().toLowerCase() === normalized
  );
}

/**
 * Get a single dashboard item by ID
 */
export function getDashboardItem(itemId: string): DashboardItem | null {
  const dashboard = loadDashboard();
  return dashboard.items.find(item => item.id === itemId) || null;
}

/**
 * Reorder dashboard items
 */
export function reorderDashboardItems(itemIds: string[]): boolean {
  const dashboard = loadDashboard();
  
  // Create a map of current items
  const itemMap = new Map(dashboard.items.map(item => [item.id, item]));
  
  // Reorder based on provided IDs
  const reordered: DashboardItem[] = [];
  itemIds.forEach((id, index) => {
    const item = itemMap.get(id);
    if (item) {
      reordered.push({ ...item, order: index });
    }
  });
  
  // Add any items that weren't in the provided list (shouldn't happen normally)
  dashboard.items.forEach(item => {
    if (!itemIds.includes(item.id)) {
      reordered.push({ ...item, order: reordered.length });
    }
  });
  
  dashboard.items = reordered;
  dashboard.lastUpdated = new Date().toISOString();
  
  return saveDashboard(dashboard);
}

/**
 * Clear all dashboard items
 */
export function clearDashboard(): boolean {
  const dashboard: Dashboard = {
    items: [],
    lastUpdated: new Date().toISOString(),
  };
  
  return saveDashboard(dashboard);
}

/**
 * Export dashboard as JSON for backup/sharing
 */
export function exportDashboard(): string {
  const dashboard = loadDashboard();
  return JSON.stringify(dashboard, null, 2);
}

/**
 * Import dashboard from JSON
 */
export function importDashboard(jsonString: string): boolean {
  try {
    const dashboard = JSON.parse(jsonString) as Dashboard;
    
    // Validate structure
    if (!dashboard.items || !Array.isArray(dashboard.items)) {
      throw new Error('Invalid dashboard format');
    }
    
    return saveDashboard(dashboard);
  } catch (error) {
    console.error('Failed to import dashboard:', error);
    return false;
  }
}


