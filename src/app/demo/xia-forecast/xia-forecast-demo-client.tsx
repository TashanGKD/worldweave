'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  Database,
  GitBranch,
  Globe2,
  Layers3,
  Network,
  Play,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import styles from './xia-forecast-demo.module.css';

export type XiaForecastDemoData = {
  generatedAt: string;
  signals: Array<{
    id: string;
    title: string;
    summary: string;
    source: string;
    category: string;
    scene: string;
    time: string;
    strength: number;
  }>;
  sourceStats: {
    stable: number;
    watchlist: number;
    blocked: number;
    activeSignals: number;
    categoryMix: Array<{ name: string; count: number }>;
  };
  questions: Array<{
    id: string;
    title: string;
    topic: string;
    status: string;
    resolveAt: string;
    evidenceCount: number;
    discussionCount: number;
    xiaCount: number;
    moderatorLine: string;
  }>;
  evaluation: {
    currentQuestionCount: number;
    resolvedQuestionCount: number;
    avgBrier: number | null;
    hitRate: number | null;
    formalAvgBrier: number | null;
    formalHitRate: number | null;
    scorecardLabel: string;
    scorecardVotes: number;
    history: Array<{ label: string; brier: number; hit: number }>;
  };
};

const STEPS = [
  {
    title: '信源进入',
    copy: '一个月内的高质量信源先进入证据池，保留来源、时间和主题方向。',
    icon: Database,
  },
  {
    title: '图谱归并',
    copy: '同一事件被折成一条主线，相关报道变成旁证，而不是重复刷屏。',
    icon: Network,
  },
  {
    title: '虾群推演',
    copy: '不同观察虾沿着证据链给出倾向、反证条件和需要继续盯的变量。',
    icon: Bot,
  },
  {
    title: '预测回看',
    copy: 'LiveBench 已有预测持续结算，反过来校准这套演绎方法。',
    icon: ShieldCheck,
  },
] as const;

const NODE_COLORS = ['#38e7c0', '#67c9ff', '#ff5578'];

function percent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function decimal(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '--';
  return value.toFixed(3);
}

function shortTime(value: string) {
  if (!value) return '实时';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '实时';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function statusLabel(status: string) {
  if (status === 'resolved') return '已结算';
  if (status === 'watchlist') return '观察中';
  if (status === 'pending') return '待确认';
  return '进行中';
}

function sourceTone(index: number) {
  return styles[`tone${(index % 3) + 1}` as keyof typeof styles] || '';
}

function buildFallbackData(data: XiaForecastDemoData): XiaForecastDemoData {
  if (data.signals.length && data.questions.length) return data;
  return {
    ...data,
    signals: data.signals.length
      ? data.signals
      : [
          {
            id: 'fallback-signal-1',
            title: '等待在线信源同步完成',
            summary: '演示页已经接入真实数据入口；当信源缓存刷新后，这里会展示最新高质量线索。',
            source: '世界信源',
            category: '已接入信源',
            scene: '世界',
            time: data.generatedAt,
            strength: 64,
          },
        ],
    questions: data.questions.length
      ? data.questions
      : [
          {
            id: 'fallback-question-1',
            title: '当前预测题池正在准备',
            topic: 'LiveBench',
            status: 'active',
            resolveAt: data.generatedAt,
            evidenceCount: 0,
            discussionCount: 0,
            xiaCount: 0,
            moderatorLine: '预测题池同步后，右侧会显示证据、虾群判断和回看表现。',
          },
        ],
  };
}

function KnowledgeGraph({
  signals,
  questions,
  selectedSignal,
  selectedQuestion,
  onSignal,
  onQuestion,
}: {
  signals: XiaForecastDemoData['signals'];
  questions: XiaForecastDemoData['questions'];
  selectedSignal: number;
  selectedQuestion: number;
  onSignal: (index: number) => void;
  onQuestion: (index: number) => void;
}) {
  const graphSignals = signals.slice(0, 5);
  const graphQuestions = questions.slice(0, 4);
  const eventNodes = [
    { x: 42, y: 26, label: '事件主线' },
    { x: 48, y: 52, label: '旁证折叠' },
    { x: 38, y: 75, label: '反证变量' },
  ];

  return (
    <div className={styles.graphWrap}>
      <svg className={styles.graphSvg} viewBox="0 0 100 100" role="img" aria-label="信源到预测的知识图谱演示">
        <defs>
          <linearGradient id="xiaFlow" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#38e7c0" />
            <stop offset="52%" stopColor="#67c9ff" />
            <stop offset="100%" stopColor="#ff5578" />
          </linearGradient>
          <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {[12, 31, 50, 69, 88].map((y, index) => (
          <line
            key={`source-link-${y}`}
            className={styles.flowLine}
            x1="13"
            x2={eventNodes[index % eventNodes.length].x - 6}
            y1={y}
            y2={eventNodes[index % eventNodes.length].y}
          />
        ))}
        {eventNodes.map((node, index) => (
          <line
            key={`question-link-${node.label}`}
            className={styles.flowLine}
            x1={node.x + 5}
            x2="71"
            y1={node.y}
            y2={22 + index * 22}
          />
        ))}
        {[24, 50, 76].map((y) => (
          <line key={`output-link-${y}`} className={styles.flowLineStrong} x1="78" x2="91" y1={y} y2="50" />
        ))}

        {graphSignals.map((signal, index) => {
          const y = 12 + index * 19;
          return (
            <g
              key={signal.id}
              className={`${styles.graphNode} ${selectedSignal === index ? styles.graphNodeActive : ''}`}
              onClick={() => onSignal(index)}
              tabIndex={0}
              role="button"
              aria-label={`选择信源 ${signal.title}`}
            >
              <circle cx="13" cy={y} r={selectedSignal === index ? 4.6 : 3.7} fill={NODE_COLORS[index % 3]} filter="url(#softGlow)" />
              <text x="20" y={y - 1.5}>{signal.scene}</text>
              <text className={styles.nodeCaption} x="20" y={y + 3.7}>{signal.source.slice(0, 18)}</text>
            </g>
          );
        })}

        {eventNodes.map((node, index) => (
          <g key={node.label} className={styles.eventNode}>
            <circle cx={node.x} cy={node.y} r="6.2" fill="rgba(12, 30, 45, .96)" stroke={NODE_COLORS[index % 3]} />
            <circle className={styles.nodePulse} cx={node.x} cy={node.y} r="8" />
            <text x={node.x} y={node.y + 1.5} textAnchor="middle">{node.label}</text>
          </g>
        ))}

        {graphQuestions.map((question, index) => {
          const y = 22 + index * 18;
          return (
            <g
              key={question.id}
              className={`${styles.questionNode} ${selectedQuestion === index ? styles.graphNodeActive : ''}`}
              onClick={() => onQuestion(index)}
              tabIndex={0}
              role="button"
              aria-label={`选择预测题 ${question.title}`}
            >
              <rect x="70" y={y - 7} width="18" height="12" rx="4" fill="rgba(8, 20, 34, .92)" stroke={NODE_COLORS[(index + 1) % 3]} />
              <text x="79" y={y - 1} textAnchor="middle">{question.topic.slice(0, 6)}</text>
              <text className={styles.nodeCaption} x="79" y={y + 4} textAnchor="middle">{statusLabel(question.status)}</text>
            </g>
          );
        })}

        <g className={styles.outputNode}>
          <circle cx="92" cy="50" r="6.5" fill="url(#xiaFlow)" filter="url(#softGlow)" />
          <text x="92" y="52" textAnchor="middle">虾</text>
        </g>
      </svg>
      <div className={styles.graphLegend}>
        <span><i className={styles.legendGreen} />上升信号</span>
        <span><i className={styles.legendBlue} />确认信号</span>
        <span><i className={styles.legendRed} />风险信号</span>
      </div>
    </div>
  );
}

export default function XiaForecastDemoClient({ data }: { data: XiaForecastDemoData }) {
  const demo = useMemo(() => buildFallbackData(data), [data]);
  const [activeStep, setActiveStep] = useState(1);
  const [selectedSignal, setSelectedSignal] = useState(0);
  const [selectedQuestion, setSelectedQuestion] = useState(0);
  const [playMode, setPlayMode] = useState<'live' | 'review'>('live');

  const signal = demo.signals[selectedSignal] || demo.signals[0];
  const question = demo.questions[selectedQuestion] || demo.questions[0];
  const sourceTotal = demo.sourceStats.stable + demo.sourceStats.watchlist + demo.sourceStats.blocked;
  const confidence = Math.min(92, Math.max(38, 44 + question.evidenceCount * 2 + question.xiaCount * 3));
  const challenge = Math.max(8, 100 - confidence);

  return (
    <main className={styles.shell}>
      <div className={styles.aurora} />
      <div className={styles.scanline} />

      <header className={styles.header}>
        <div>
          <div className={styles.brandRow}>
            <span className={styles.brandMark}><Sparkles size={18} /></span>
            <span>WorldWeave · Xia Forecast Lab</span>
          </div>
          <h1>世界信源演绎控制台</h1>
          <p>把高质量信源、知识图谱、虾群推演和 LiveBench 回看放在同一个可演示的现场。</p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={`${styles.modeButton} ${playMode === 'live' ? styles.modeActive : ''}`}
            onClick={() => setPlayMode('live')}
            type="button"
          >
            <Play size={15} /> 实时演示
          </button>
          <button
            className={`${styles.modeButton} ${playMode === 'review' ? styles.modeActive : ''}`}
            onClick={() => setPlayMode('review')}
            type="button"
          >
            <RefreshCw size={15} /> 回看校准
          </button>
        </div>
      </header>

      <section className={styles.metrics} aria-label="核心指标">
        <div className={styles.metric}>
          <Globe2 size={20} />
          <span>近 30 天信号</span>
          <strong>{demo.sourceStats.activeSignals || demo.signals.length}</strong>
        </div>
        <div className={styles.metric}>
          <Radar size={20} />
          <span>稳定信源</span>
          <strong>{demo.sourceStats.stable || sourceTotal || '--'}</strong>
        </div>
        <div className={styles.metric}>
          <GitBranch size={20} />
          <span>预测题池</span>
          <strong>{demo.evaluation.currentQuestionCount || demo.questions.length}</strong>
        </div>
        <div className={styles.metric}>
          <Activity size={20} />
          <span>回看命中</span>
          <strong>{percent(demo.evaluation.formalHitRate ?? demo.evaluation.hitRate)}</strong>
        </div>
      </section>

      <section className={styles.stage}>
        <aside className={styles.stageRail} aria-label="演示流程">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <button
                key={step.title}
                className={`${styles.step} ${activeStep === index ? styles.stepActive : ''}`}
                onClick={() => setActiveStep(index)}
                type="button"
              >
                <span className={styles.stepIndex}>0{index + 1}</span>
                <Icon size={18} />
                <strong>{step.title}</strong>
                <small>{step.copy}</small>
              </button>
            );
          })}
        </aside>

        <section className={styles.graphPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>知识图谱现场</span>
              <h2>信源如何变成可追踪的预测证据</h2>
            </div>
            <div className={styles.pulseBadge}>
              <Zap size={15} /> {playMode === 'live' ? '正在推演' : '正在复盘'}
            </div>
          </div>
          <KnowledgeGraph
            signals={demo.signals}
            questions={demo.questions}
            selectedSignal={selectedSignal}
            selectedQuestion={selectedQuestion}
            onSignal={setSelectedSignal}
            onQuestion={setSelectedQuestion}
          />
          <div className={styles.activeSignal}>
            <span className={`${styles.signalOrb} ${sourceTone(selectedSignal)}`} />
            <div>
              <small>{signal.source} · {shortTime(signal.time)}</small>
              <strong>{signal.title}</strong>
              <p>{signal.summary}</p>
            </div>
            <div className={styles.signalScore}>
              <span>{signal.strength}</span>
              <small>强度</small>
            </div>
          </div>
        </section>

        <aside className={styles.cockpit}>
          <div className={styles.cockpitTop}>
            <span className={styles.kicker}>预测驾驶舱</span>
            <h2>{question.title}</h2>
            <p>{question.moderatorLine}</p>
          </div>

          <div className={styles.probability}>
            <div className={styles.probabilityHeader}>
              <span>当前倾向</span>
              <strong>{confidence}%</strong>
            </div>
            <div className={styles.meter} style={{ '--yes': `${confidence}%`, '--no': `${challenge}%` } as React.CSSProperties}>
              <span />
            </div>
            <div className={styles.meterLabels}>
              <span>支持证据 {question.evidenceCount}</span>
              <span>反证余量 {challenge}%</span>
            </div>
          </div>

          <div className={styles.xiaStack}>
            <div className={styles.xiaAgent}>
              <Bot size={17} />
              <div>
                <strong>节奏观察虾</strong>
                <span>盯连续变量、发布时间和市场反应。</span>
              </div>
            </div>
            <div className={styles.xiaAgent}>
              <Layers3 size={17} />
              <div>
                <strong>政策观察虾</strong>
                <span>盯官方动作、执行证据和反向口径。</span>
              </div>
            </div>
          </div>

          <div className={styles.livebenchCard}>
            <span>LiveBench 回看</span>
            <div className={styles.livebenchGrid}>
              <div><strong>{decimal(demo.evaluation.formalAvgBrier ?? demo.evaluation.avgBrier)}</strong><small>Brier</small></div>
              <div><strong>{demo.evaluation.resolvedQuestionCount || '--'}</strong><small>已结算</small></div>
              <div><strong>{demo.evaluation.scorecardVotes || '--'}</strong><small>投票</small></div>
            </div>
          </div>
        </aside>
      </section>

      <section className={styles.lowerGrid}>
        <div className={styles.streamPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>信源流</span>
              <h2>高质量信息进入演绎链</h2>
            </div>
            <span className={styles.timeBadge}>更新 {shortTime(demo.generatedAt)}</span>
          </div>
          <div className={styles.streamList}>
            {demo.signals.slice(0, 7).map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={`${styles.streamItem} ${selectedSignal === index ? styles.streamItemActive : ''}`}
                onClick={() => setSelectedSignal(index)}
              >
                <span className={`${styles.signalOrb} ${sourceTone(index)}`} />
                <span className={styles.streamBody}>
                  <small>{item.category} · {item.source}</small>
                  <strong>{item.title}</strong>
                </span>
                <em>{item.strength}</em>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.chartPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>预测回看</span>
              <h2>方法是否越来越稳</h2>
            </div>
            <span className={styles.timeBadge}>{demo.evaluation.scorecardLabel}</span>
          </div>
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={demo.evaluation.history.length ? demo.evaluation.history : [{ label: '当前', brier: demo.evaluation.avgBrier || 0, hit: demo.evaluation.hitRate || 0 }]}>
                <defs>
                  <linearGradient id="hitFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#38e7c0" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#38e7c0" stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="brierFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#ff5578" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#ff5578" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
                <XAxis dataKey="label" stroke="rgba(221,244,255,.48)" tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(221,244,255,.48)" tickLine={false} axisLine={false} domain={[0, 1]} />
                <Tooltip
                  contentStyle={{ background: 'rgba(7, 16, 27, .94)', border: '1px solid rgba(103, 201, 255, .22)', borderRadius: 12 }}
                  labelStyle={{ color: '#dff8ff' }}
                />
                <Area type="monotone" dataKey="hit" name="命中率" stroke="#38e7c0" fill="url(#hitFill)" strokeWidth={2.4} />
                <Area type="monotone" dataKey="brier" name="Brier" stroke="#ff5578" fill="url(#brierFill)" strokeWidth={2.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.questionPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>题池切换</span>
              <h2>选择一个未来问题</h2>
            </div>
          </div>
          <div className={styles.questionList}>
            {demo.questions.slice(0, 5).map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.questionItem} ${selectedQuestion === index ? styles.questionItemActive : ''}`}
                onClick={() => setSelectedQuestion(index)}
              >
                <span>0{index + 1}</span>
                <strong>{item.title}</strong>
                <small>{item.topic} · {statusLabel(item.status)} · {item.xiaCount || 0} 只虾</small>
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
