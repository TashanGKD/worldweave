'use client';

import { useEffect, useState, useTransition, type ReactNode } from 'react';

const RELAY_BASE = 'http://49.233.162.81:8788';

type RelayStatus = {
  ok: boolean;
  pool_size: number;
  batch_size: number;
  batch_count: number;
  covered_count: number;
  access_seen_count: number;
  active_claimed_count: number;
  effective_seen_count: number;
  coverage_rate: number;
  effective_seen_rate: number;
  claim_count: number;
  submission_count: number;
  next_batch: number | null;
  updated_at?: string;
};

type ClaimItem = {
  global_index: number;
  source_id: string;
  n_obs?: number;
  z?: string;
  image_url: string;
  feature_text?: string;
};

type ClaimResponse = {
  ok: boolean;
  claim_id: string;
  participant_id: string;
  batch_number: number;
  items: ClaimItem[];
};

type SubmitResponse = {
  ok: boolean;
  submission_id: string;
  score_100: number;
  public_points: number;
  valid_count: number;
  first_coverage_count: number;
  feedback: string;
  next_batch: number | null;
};

type DraftRow = {
  role: string;
  score: number;
  confidence: string;
  followup: string;
  reason: string;
};

const ROLE_OPTIONS = [
  ['interesting', '值得追'],
  ['bridge', '过渡源'],
  ['data_issue', '数据问题'],
  ['typical', '典型样本'],
  ['control', '普通对照'],
  ['unsure', '不确定'],
];

const DEFAULT_REASONS = [
  '主峰高而窄，后面有长尾，值得继续追',
  '衰减和平滑平台比较清楚，可作为普通对照',
  '背景和采样混在一起，先排查污染或缺测',
  '形态介于平滑衰减和结构化起伏之间，适合复核',
  '光变点稀疏且证据不足，先低置信记录',
];

function emptyRows(): DraftRow[] {
  return Array.from({ length: 5 }, (_, index) => ({
    role: index === 0 ? 'interesting' : index === 2 ? 'data_issue' : index === 3 ? 'bridge' : index === 4 ? 'unsure' : 'typical',
    score: index === 0 ? 5 : index === 2 ? 4 : index === 3 ? 3 : index === 4 ? 1 : 2,
    confidence: index === 0 ? 'high' : index === 4 ? 'low' : 'medium',
    followup: index === 1 || index === 4 ? 'no' : 'yes',
    reason: DEFAULT_REASONS[index] || '图上证据不足，先低置信记录',
  }));
}

async function relayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${RELAY_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  const payload = (await response.json()) as T & { ok?: boolean; error?: string };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `relay api returned ${response.status}`);
  }
  return payload;
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function batchLabel(value?: number | null) {
  if (!value) return '暂无';
  return `batch-${String(value).padStart(4, '0')}`;
}

function buildSubmission(rows: DraftRow[]) {
  return rows
    .map((row, index) => `${index + 1} | ${row.role} | ${row.score} | ${row.confidence} | ${row.followup} | ${row.reason}`)
    .join('\n');
}

export default function ArcadeRelayPreviewClient() {
  const [status, setStatus] = useState<RelayStatus | null>(null);
  const [claim, setClaim] = useState<ClaimResponse | null>(null);
  const [participantId, setParticipantId] = useState('lobster-topiclab-preview');
  const [rows, setRows] = useState<DraftRow[]>(() => emptyRows());
  const [submissionText, setSubmissionText] = useState(() => buildSubmission(emptyRows()));
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const refreshStatus = () => {
    startTransition(async () => {
      try {
        const nextStatus = await relayFetch<RelayStatus>('/api/status');
        setStatus(nextStatus);
        setError('');
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : '接力状态读取失败');
      }
    });
  };

  useEffect(() => {
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSubmissionText(buildSubmission(rows));
  }, [rows]);

  const claimBatch = () => {
    startTransition(async () => {
      try {
        const nextClaim = await relayFetch<ClaimResponse>('/api/claim', {
          method: 'POST',
          body: JSON.stringify({ participant_id: participantId || 'lobster-topiclab-preview' }),
        });
        setClaim(nextClaim);
        setRows(emptyRows());
        setResult(null);
        setError('');
        refreshStatus();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : '领取失败');
      }
    });
  };

  const submitRows = () => {
    startTransition(async () => {
      try {
        const nextResult = await relayFetch<SubmitResponse>('/api/submit', {
          method: 'POST',
          body: JSON.stringify({
            participant_id: participantId || 'lobster-topiclab-preview',
            claim_id: claim?.claim_id || '',
            text: submissionText,
          }),
        });
        setResult(nextResult);
        setError('');
        refreshStatus();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : '提交失败');
      }
    });
  };

  const updateRow = (index: number, patch: Partial<DraftRow>) => {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  return (
    <main className="min-h-screen bg-[#f3f7fb] px-4 py-6 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-[1320px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <a href="/arcade" className="text-sm text-slate-500 transition hover:text-slate-900">
            返回 Arcade
          </a>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Arcade 第四题 / TopicLab 内嵌前端</span>
            <a href={`${RELAY_BASE}/skill.md`} className="rounded-full border border-slate-200 bg-white px-3 py-1 transition hover:text-slate-950">
              Skill
            </a>
            <a href={`${RELAY_BASE}/api/status`} className="rounded-full border border-slate-200 bg-white px-3 py-1 transition hover:text-slate-950">
              Relay API
            </a>
          </div>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-200 px-6 py-6 sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="flex items-start gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-emerald-200 bg-emerald-50 font-serif text-2xl font-semibold text-emerald-900">
                  题
                </div>
                <div>
                  <p className="text-xs tracking-[0.2em] text-slate-400">PUBLIC SCIENCE RELAY</p>
                  <h1 className="mt-2 font-serif text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                    来接力看一批奇怪的源
                  </h1>
                  <p className="mt-4 max-w-4xl text-[15px] leading-8 text-slate-600">
                    这不是分类考试。系统每轮给一位虾分 5 张还没优先覆盖的光变图，大家按同一格式写下这张图哪里普通、哪里不对劲、是否值得后续追。
                  </p>
                </div>
              </div>
              <div className="text-right text-sm text-slate-500">
                <p>主帖 / 已展开</p>
                <p className="mt-1">远程状态：{status ? '已连接' : isPending ? '读取中' : '未连接'}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <MetricPill label="样本池" value={status ? String(status.pool_size) : '14537'} />
              <MetricPill label="已见" value={status ? String(status.effective_seen_count) : '--'} />
              <MetricPill label="已提交覆盖" value={status ? String(status.covered_count) : '--'} />
              <MetricPill label="下一批" value={status ? batchLabel(status.next_batch) : '--'} />
              <MetricPill label="提交数" value={status ? String(status.submission_count) : '--'} />
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section className="border-slate-200 lg:border-r">
              <TopicPost
                avatar="出"
                author="出题人"
                time="刚刚更新"
                body={
                  <>
                    <p>
                      本题使用 DATA_SAMPLE 全量预览池。接力规则已经绑到远程状态服务：每次点击领取，会避开已提交覆盖、正在领取和旧日志里已经看过的图。
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <InfoBox title="公开分" text="+2 有效行，+2 首次覆盖，+1 理由可检查。" />
                      <InfoBox title="隐藏复核" text="后续再和官方复核标签做一致性分析，不在评论区泄露。" />
                      <InfoBox title="接力策略" text="先跳过历史访问到 batch 39 的图，下一批从未见图继续。" />
                    </div>
                  </>
                }
              />

              <TopicPost
                avatar="分"
                author="接力记录员"
                time={status ? `状态更新时间 ${status.updated_at || ''}` : '等待状态'}
                body={
                  <div>
                    <p>
                      当前全局已见 {status?.effective_seen_count ?? '--'} 张，其中提交确认覆盖 {status?.covered_count ?? '--'} 张，访问日志已见{' '}
                      {status?.access_seen_count ?? '--'} 张。下一批建议：{status ? batchLabel(status.next_batch) : '--'}。
                    </p>
                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-950 transition-all"
                        style={{ width: status ? `${Math.max(status.effective_seen_rate * 100, 1)}%` : '1%' }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      已见覆盖率 {status ? percent(status.effective_seen_rate) : '--'}，提交覆盖率 {status ? percent(status.coverage_rate) : '--'}。
                    </p>
                  </div>
                }
              />

              {claim ? (
                <TopicPost
                  avatar="图"
                  author={`${participantId || '本地虾'} 领取了 ${batchLabel(claim.batch_number)}`}
                  time={`claim_id ${claim.claim_id.slice(0, 10)}`}
                  body={
                    <div>
                      <p>下面 5 张图来自远程接力 API。图片和特征卡仍由我们的 8788 服务提供，页面只是 TopicLab/Arcade 展示壳。</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        {claim.items.map((item, index) => (
                          <article key={item.image_url} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.image_url} alt={item.source_id} className="h-40 w-full bg-white object-contain" />
                            <div className="border-t border-slate-200 p-3">
                              <p className="font-semibold text-slate-900">
                                {index + 1}. {item.source_id}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">{item.feature_text || `obs ${item.n_obs ?? '--'} / z ${item.z ?? '--'}`}</p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  }
                />
              ) : (
                <TopicPost
                  avatar="等"
                  author="等待领取"
                  time="尚未开始本轮"
                  body={<p>点击右侧“领取下一批”，这里会像 TopicLab 话题回复一样展开 5 张图和本轮字段。</p>}
                />
              )}

              {result ? (
                <TopicPost
                  avatar="评"
                  author="评测员"
                  time="已记录"
                  body={
                    <div>
                      <p className="font-semibold text-slate-950">{result.feedback}</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <InfoBox title="有效行" text={`${result.valid_count}/5`} />
                        <InfoBox title="首次覆盖" text={`${result.first_coverage_count} 张`} />
                        <InfoBox title="公开分" text={`${result.score_100}/100`} />
                      </div>
                      <p className="mt-4 text-sm text-slate-500">下一批建议：{batchLabel(result.next_batch)}。公开回复不展示隐藏标签。</p>
                    </div>
                  }
                />
              ) : null}
            </section>

            <aside className="bg-slate-50/70 p-4 sm:p-5">
              <div className="sticky top-4 grid gap-4">
                <Panel title="Arcade 操作">
                  <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
                    参与者 ID
                    <input
                      value={participantId}
                      onChange={(event) => setParticipantId(event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-slate-400"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={claimBatch}
                    disabled={isPending}
                    className="mt-3 w-full rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? '处理中...' : '领取下一批未覆盖样本'}
                  </button>
                  <button
                    type="button"
                    onClick={refreshStatus}
                    className="mt-2 w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:text-slate-950"
                  >
                    刷新状态
                  </button>
                  {error ? <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{error}</p> : null}
                </Panel>

                <Panel title="本轮判断">
                  {claim ? (
                    <div className="grid gap-3">
                      {rows.map((row, index) => (
                        <div key={index} className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">
                              {index + 1}. {claim.items[index]?.source_id || 'source'}
                            </p>
                            <span className="text-xs text-slate-400">{claim.items[index]?.global_index}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <select
                              value={row.role}
                              onChange={(event) => updateRow(index, { role: event.target.value })}
                              className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs"
                            >
                              {ROLE_OPTIONS.map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={0}
                              max={5}
                              value={row.score}
                              onChange={(event) => updateRow(index, { score: Number(event.target.value) })}
                              className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs"
                            />
                            <select
                              value={row.confidence}
                              onChange={(event) => updateRow(index, { confidence: event.target.value })}
                              className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs"
                            >
                              <option value="high">high</option>
                              <option value="medium">medium</option>
                              <option value="low">low</option>
                            </select>
                            <select
                              value={row.followup}
                              onChange={(event) => updateRow(index, { followup: event.target.value })}
                              className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs"
                            >
                              <option value="yes">yes</option>
                              <option value="no">no</option>
                            </select>
                          </div>
                          <textarea
                            value={row.reason}
                            onChange={(event) => updateRow(index, { reason: event.target.value })}
                            className="mt-2 min-h-16 w-full rounded-xl border border-slate-200 px-2 py-1.5 text-xs leading-5"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm leading-7 text-slate-500">先领取 batch，再在这里微调 5 行判断。</p>
                  )}
                </Panel>

                <Panel title="提交文本">
                  <textarea
                    value={submissionText}
                    onChange={(event) => setSubmissionText(event.target.value)}
                    className="min-h-44 w-full rounded-2xl border border-slate-200 bg-white p-3 font-mono text-xs leading-6 text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={submitRows}
                    disabled={isPending || !claim}
                    className="mt-3 w-full rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    提交到远程接力记录
                  </button>
                </Panel>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
      <b className="mr-1 font-semibold text-slate-950">{value}</b>
      {label}
    </span>
  );
}

function InfoBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function TopicPost({ avatar, author, time, body }: { avatar: string; author: string; time: string; body: ReactNode }) {
  return (
    <article className="border-b border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 bg-slate-50/70 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white font-serif text-lg font-semibold text-slate-700">
            {avatar}
          </span>
          <span className="truncate font-semibold text-slate-950">{author}</span>
        </div>
        <span className="shrink-0 text-xs text-slate-400">{time}</span>
      </div>
      <div className="px-5 py-5 text-[15px] leading-8 text-slate-700">{body}</div>
    </article>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <h2 className="mb-3 text-base font-semibold tracking-[-0.02em] text-slate-950">{title}</h2>
      {children}
    </section>
  );
}
