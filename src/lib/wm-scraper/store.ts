import { UnifiedSignal, generateDedupeKey } from './types';

/**
 * 去重和存储模块
 * 支持增量更新和持久化
 */

export interface SignalStore {
  version: number;
  updatedAt: string;
  signals: Record<string, StoredSignal>;
}

export interface StoredSignal extends UnifiedSignal {
  dedupe_key: string;
  first_seen_at: string;
  last_seen_at: string;
  seen_count: number;
}

// 内存存储
class SignalStoreManager {
  private store: SignalStore;
  private initialized: boolean = false;

  constructor() {
    this.store = {
      version: 1,
      updatedAt: new Date().toISOString(),
      signals: {},
    };
  }

  // 从数据库加载（异步）
  async loadFromDatabase(fetchFn: () => Promise<UnifiedSignal[]>): Promise<void> {
    try {
      const signals = await fetchFn();
      this.store.signals = {};
      
      for (const signal of signals) {
        const dedupeKey = signal.dedupe_key || generateDedupeKey(signal);
        this.store.signals[dedupeKey] = {
          ...signal,
          dedupe_key: dedupeKey,
          first_seen_at: signal.first_seen_at || signal.observed_at,
          last_seen_at: signal.last_seen_at || signal.observed_at,
          seen_count: signal.seen_count || 1,
        } as StoredSignal;
      }
      
      this.initialized = true;
      console.log(`[SignalStore] Loaded ${Object.keys(this.store.signals).length} signals from database`);
    } catch (error) {
      console.error('[SignalStore] Failed to load from database:', error);
      this.initialized = true; // 即使失败也标记为已初始化，避免阻塞
    }
  }

  // 合并新信号
  mergeSignals(newSignals: UnifiedSignal[]): {
    merged: StoredSignal[];
    newCount: number;
    updatedCount: number;
  } {
    const now = new Date().toISOString();
    const merged: StoredSignal[] = [];
    let newCount = 0;
    let updatedCount = 0;

    for (const signal of newSignals) {
      const dedupeKey = generateDedupeKey(signal);
      const existing = this.store.signals[dedupeKey];

      if (existing) {
        // 更新现有信号
        const updated: StoredSignal = {
          ...existing,
          // 更新可变字段
          severity: signal.severity ?? existing.severity,
          relevance_score: signal.relevance_score ?? existing.relevance_score,
          summary: signal.summary || existing.summary,
          // 更新时间戳
          last_seen_at: now,
          seen_count: existing.seen_count + 1,
          // 保留原始payload的最新版本
          raw_payload: signal.raw_payload,
        };
        this.store.signals[dedupeKey] = updated;
        merged.push(updated);
        updatedCount++;
      } else {
        // 新增信号
        const stored: StoredSignal = {
          ...signal,
          dedupe_key: dedupeKey,
          first_seen_at: now,
          last_seen_at: now,
          seen_count: 1,
        };
        this.store.signals[dedupeKey] = stored;
        merged.push(stored);
        newCount++;
      }
    }

    this.store.updatedAt = now;
    return { merged, newCount, updatedCount };
  }

  // 获取所有信号（按时间排序，最新的在前）
  getAllSignals(): StoredSignal[] {
    return Object.values(this.store.signals).sort((a, b) => {
      // 按发布时间排序（最新的在前）
      const timeA = new Date(a.published_at || a.last_seen_at).getTime();
      const timeB = new Date(b.published_at || b.last_seen_at).getTime();
      return timeB - timeA;
    });
  }

  // 获取统计信息
  getStats(): {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    byCountry: Record<string, number>;
  } {
    const signals = Object.values(this.store.signals);
    
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = { critical: 0, elevated: 0, normal: 0, unknown: 0 };
    const byCountry: Record<string, number> = {};

    for (const signal of signals) {
      // By type
      byType[signal.signal_type] = (byType[signal.signal_type] || 0) + 1;

      // By severity
      const severity = signal.severity ?? -1;
      if (severity >= 4) bySeverity.critical++;
      else if (severity >= 3) bySeverity.elevated++;
      else if (severity >= 0) bySeverity.normal++;
      else bySeverity.unknown++;

      // By country
      const country = signal.country || 'Unknown';
      byCountry[country] = (byCountry[country] || 0) + 1;
    }

    return {
      total: signals.length,
      byType,
      bySeverity,
      byCountry,
    };
  }

  // 转换为UnifiedSignal数组（用于响应）
  toUnifiedSignals(): UnifiedSignal[] {
    return this.getAllSignals();
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

// 单例导出
export const signalStore = new SignalStoreManager();
