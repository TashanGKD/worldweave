'use client';

import type { WorldMarketSnapshot } from '@/lib/world/types';

function formatTime(value?: string | null) {
  if (!value) return '--';
  return new Date(value).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPercent(value?: number | null) {
  if (typeof value !== 'number') return '--';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

function marketLabel(value: 'CN' | 'HK' | 'US') {
  if (value === 'CN') return 'A 股';
  if (value === 'HK') return '港股';
  return '美股';
}

function changeTone(value?: number | null) {
  if (typeof value !== 'number') return 'text-slate-500';
  if (value > 0) return 'text-emerald-700';
  if (value < 0) return 'text-rose-700';
  return 'text-slate-500';
}

interface WorldMarketMonitorProps {
  snapshot: WorldMarketSnapshot | null;
}

export default function WorldMarketMonitor({ snapshot }: WorldMarketMonitorProps) {
  if (!snapshot) {
    return (
      <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5 text-sm text-slate-500">
        当前还没有拿到市场监测快照。
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-[24px] border border-slate-200/80 bg-[radial-gradient(circle_at_top,#f8fbff,rgba(255,255,255,0.96)_46%,#f6f8fb_100%)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-semibold tracking-[-0.02em] text-slate-950">真实市场监测</h3>
          <p className="mt-1 text-xs leading-6 text-slate-500">
        直接基于公开行情接口渲染。只保留行情快照，不混普通信号摘要，也不混入非行情内容。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">
            前端轮询 60 秒
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">
            后端缓存 {snapshot.refresh_interval_seconds} 秒
          </span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {[
          { label: '最新交易日', value: snapshot.latest_trade_date || '--', hint: `结算时间 ${formatTime(snapshot.latest_settle_time)}` },
          { label: '快照生成', value: formatTime(snapshot.generated_at), hint: '当前页面使用的最新快照' },
          { label: '今日成交', value: String(snapshot.stats.today_trades || '--'), hint: `累计成交 ${snapshot.stats.total_trades || '--'}` },
          { label: '可交易标的', value: String(snapshot.stats.tradeable_symbols || '--'), hint: '三市场合计' },
        ].map((item) => (
          <div key={item.label} className="rounded-[20px] border border-slate-200 bg-white/90 px-4 py-3">
            <div className="text-xs tracking-[0.08em] text-slate-400">{item.label}</div>
            <div className="mt-1 font-serif text-[1.35rem] font-semibold tracking-[-0.03em] text-slate-950">{item.value}</div>
            <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {(['CN', 'HK', 'US'] as const).map((market) => (
          <div key={market} className="rounded-[22px] border border-slate-200 bg-white/90 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{marketLabel(market)}</p>
                <p className="text-xs text-slate-500">领涨异动 + 最新样本</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                {snapshot.markets[market].stocks.length} 支
              </span>
            </div>

            <div className="space-y-2">
              {snapshot.markets[market].movers.slice(0, 3).map((item) => (
                <div key={`${market}-mover-${item.symbol}`} className="rounded-[16px] border border-emerald-100 bg-emerald-50/70 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{item.name}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{item.symbol}</p>
                    </div>
                    <div className={`shrink-0 text-sm font-semibold ${changeTone(item.change_rate)}`}>{formatPercent(item.change_rate)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
              <p className="mb-2 text-xs font-medium text-slate-600">最新样本</p>
              <div className="space-y-2">
                {snapshot.markets[market].stocks.slice(0, 3).map((item) => (
                  <div key={`${market}-stock-${item.symbol}`} className="flex items-center justify-between gap-3 rounded-[14px] bg-white/90 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-900">{item.name}</p>
                      <p className="text-[11px] text-slate-500">{item.symbol}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-900">{typeof item.price === 'number' ? item.price.toFixed(2) : '--'}</p>
                      <p className={`text-[11px] ${changeTone(item.change_rate)}`}>{formatPercent(item.change_rate)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
