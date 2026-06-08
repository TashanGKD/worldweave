import { NextResponse } from 'next/server';

import {
  buildAseanDeepResearchConversation,
  buildAseanDeepResearchMessages,
  buildAseanResearchContext,
  getAseanDeepResearchConfig,
  runQwenDeepResearch,
  runQwenDeepResearchStream,
  type DashScopeMessage,
} from '@/lib/world/asean-deep-research';
import { appendAseanResearchResult, readAseanResearchResults } from '@/lib/world/asean-research-results';
import { pickDailyAseanResearchQuestions } from '@/lib/world/asean-research-suggestions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function compactText(value: unknown, max = 800) {
  const normalized = String(value || '').replace(/\s+/gu, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}

function toSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function compactContextLine(contextText: string, prefix: string, max = 900) {
  const line = contextText
    .split(/\n/u)
    .find((item) => item.startsWith(prefix))
    ?.replace(prefix, '')
    .trim();
  return line ? compactText(line, max) : '';
}

function bulletizeContext(value: string, separator: RegExp, max = 4) {
  return value
    .split(separator)
    .map((item) => compactText(item.replace(/^[-\s]+/u, ''), 260))
    .filter(Boolean)
    .slice(0, max);
}

const ASEAN_RESEARCH_SCOPE =
  /东盟|东南亚|广西|马来西亚|越南|新加坡|泰国|印尼|印度尼西亚|老挝|柬埔寨|缅甸|菲律宾|文莱|能源|电力|电价|绿电|燃油|油价|柴油|数据中心|算力|AI|人工智能|出海|市场|投资|贸易|营商|海上|通道|供应链|ASEAN|Malaysia|Vietnam|Singapore|Thailand|Indonesia|power|electric|energy|data center|compute|investment|trade/iu;
const ASEAN_COUNTRIES = ['马来西亚', '越南', '新加坡', '泰国', '印尼', '印度尼西亚', '老挝', '柬埔寨', '缅甸', '菲律宾', '文莱'];

function isActionableResearchQuestion(question: string) {
  const text = compactText(question, 400);
  if (text.length < 8) return false;
  return ASEAN_RESEARCH_SCOPE.test(text);
}

function mentionedCountries(question: string) {
  const countries = ASEAN_COUNTRIES.filter((country) => question.includes(country));
  if (question.includes('印度尼西亚') && !countries.includes('印尼')) countries.push('印尼');
  return countries.length ? countries : ['马来西亚', '越南', '新加坡', '泰国'];
}

function selectEvidenceLines(contextText: string, question: string) {
  const coreData = compactContextLine(contextText, '核心数据底板：', 1400);
  const keyMetrics = compactContextLine(contextText, '关键指标：', 1000);
  const countries = mentionedCountries(question);
  const countryLines = coreData
    .split(/\s+\|\s+/u)
    .map((item) => compactText(item, 220))
    .filter((item) => countries.some((country) => item.includes(country)))
    .slice(0, 3);
  const metricLines = bulletizeContext(keyMetrics, /；/u, 3)
    .filter((item) => /网络|设施|电力|需求|绿电|燃油|互联网|服务器|GDP|投资|贸易/u.test(item))
    .slice(0, 2);
  return [...countryLines, ...metricLines].slice(0, 4);
}

function sourceResearchConclusion(question: string) {
  if (/燃油|油价|柴油|RON95|RON97|能源成本/u.test(question)) {
    return [
      '马来西亚燃油价格更适合作为短期能源成本扰动线索，重点看柴油备用和采购成本压力是否上行。',
      '研判时要同时看电力需求、绿电占比、净电力进口和园区电价/PPA，不能只靠油价判断数据中心成本。',
      '当前可用于判断“是否需要继续深挖成本压力”，还不能替代项目级尽调。',
    ];
  }
  if (/数据中心|算力|AI|人工智能|智算|网络|IX|服务器/u.test(question)) {
    return [
      '东盟数据中心合作应优先看三件事：网络与设施基础、电力供需约束、政策和市场需求是否同时成立。',
      '广西侧更适合把越南、马来西亚、泰国作为落地场景复核对象，把新加坡作为网络枢纽和成熟市场参照。',
      '如果电力价格、PPA、并网容量和项目进度拿不到，结论只能停留在方向性排序，不能直接变成项目建议。',
    ];
  }
  if (/电力|电价|绿电|PPA|供电|发电|用电/u.test(question)) {
    return [
      '电力约束不能只看发电量，需要把电力需求、净进口、绿电占比和价格线索放在一起判断。',
      '越南、马来西亚、泰国更适合做供需压力复核；新加坡更适合做高需求、高网络密度但绿电空间有限的参照。',
      '下一步要补园区电价、PPA条款、并网容量和柴油备用使用量，才能进入项目级成本压力判断。',
    ];
  }
  if (/市场|投资|贸易|营商|出海|合作|进入|优先/u.test(question)) {
    return [
      '市场进入不能只看GDP，要同时看互联网使用、网络设施、FDI/贸易开放、电力成本和政策可执行性。',
      '东盟国家之间差异很大：新加坡偏枢纽，马来西亚和泰国偏产业承接，越南偏增长与供需压力并存。',
      '广西侧适合先做国家分层，再把电力和算力承载能力作为硬约束复核。',
    ];
  }
  return [
    '这个问题可以进入东盟专题研判，但需要先落到国家、行业或约束条件上，结论才会可复核。',
    '当前更适合先做方向性判断：哪些国家值得优先看、哪些约束需要补证、哪些来源可以支撑结论。',
    '如果要形成行动建议，需要补充时间范围、目标国家和决策用途。',
  ];
}

function buildLocalSourceResearchResult(input: {
  question: string;
  context: Awaited<ReturnType<typeof buildAseanResearchContext>>;
  reason?: string;
}) {
  const dataGaps = compactContextLine(input.context.context_text, '数据缺口：', 700);
  const recentTimeline = compactContextLine(input.context.context_text, '近期时间线：', 900);
  const timelineBullets = bulletizeContext(recentTimeline, /；/u, 3);
  const firstSources = input.context.context_sources.slice(0, 8);
  const sourceCount = Math.max(input.context.source_summary?.contributing_source_count || 0, firstSources.length);
  if (!isActionableResearchQuestion(input.question)) {
    const suggestions = pickDailyAseanResearchQuestions();
    const content = [
      '## 请补充一个具体研究问题',
      '- 当前输入还不足以形成东盟专题研判；请写明国家、议题或决策用途。',
      '- 为避免生成无来源泛化结论，本次不展开研报。',
      '',
      '## 可直接改成',
      ...suggestions.map((suggestion) => `- ${suggestion}`),
    ].join('\n');
    return {
      content,
      references: firstSources.slice(0, 3).map((source) => ({
        title: source.title,
        url: source.url,
        content: source.snippet,
      })),
      web_sites: [],
      source_count: Math.min(sourceCount, 3),
      phases: [
        {
          status: 'needs_input',
          phase: '确认问题',
          message: '等待补充具体研究问题。',
        },
      ],
      usage: null,
    };
  }
  const evidenceLines = selectEvidenceLines(input.context.context_text, input.question);
  const conclusions = sourceResearchConclusion(input.question);
  const content = [
    '## 研究结论',
    ...conclusions.map((item) => `- ${item}`),
    '',
    '## 关键依据',
    ...(evidenceLines.length ? evidenceLines : ['已接入能源电力、投资、互联网使用、网络设施和安全服务器等公开指标。']).map((item) => `- ${item}`),
    '',
    '## 仍需核验',
    `- ${dataGaps || '部分国家仍缺少项目级电价、PUE、园区负荷和跨境电力交易细项。'}`,
    '- 当前答案用于方向性研判；涉及投资、选址或合作落地时，还需要补项目级合同、并网和建设进度证据。',
    '',
    '## 近期线索',
    ...(timelineBullets.length ? timelineBullets : ['近期线索可在左侧时间线继续查看。']).map((item) => `- ${item}`),
    '',
    '## 主要来源',
    ...firstSources.map((source) => `- [${compactText(source.title, 90)}](${source.url})`),
  ].join('\n');
  return {
    content,
    references: firstSources.map((source) => ({
      title: source.title,
      url: source.url,
      content: source.snippet,
    })),
    web_sites: [],
    source_count: sourceCount,
    phases: [
      {
        status: 'source_research',
        phase: '本地来源研判',
        message: '已使用已接入公开来源形成保守研判。',
      },
    ],
    usage: null,
  };
}

function parseResearchBody(body: unknown) {
  const input = body as {
    question?: string;
    clarification?: string | null;
    messages?: Array<{ role?: string; content?: string }>;
  };
  const messages = Array.isArray(input.messages)
    ? input.messages
        .filter((message): message is { role: DashScopeMessage['role']; content: string } => {
          return (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string' && Boolean(message.content.trim());
        })
        .slice(-10)
    : [];
  return {
    question: compactText(input.question || messages.find((message) => message.role === 'user')?.content, 800),
    clarification: input.clarification || null,
    messages,
  };
}

function publicSourceSummary(summary: Awaited<ReturnType<typeof buildAseanResearchContext>>['source_summary']) {
  if (!summary) return null;
  return {
    total_source_count: summary.total_source_count,
    active_source_count: summary.active_source_count,
    contributing_source_count: summary.contributing_source_count,
    dataset_source_count: summary.dataset_source_count,
    polling_source_count: summary.polling_source_count,
    selected_contributing_source_count: summary.selected_contributing_source_count,
  };
}

export async function GET() {
  return NextResponse.json(
    {
      workflow: ['streaming-dialogue', 'research-first', 'source-linked'],
      capabilities: {
        public_source_research: true,
        streaming: true,
        source_snapshot: true,
      },
      recent_reports: await readAseanResearchResults(6),
      suggested_questions: pickDailyAseanResearchQuestions(),
    },
    {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  );
}

export async function POST(request: Request) {
  try {
    const body = parseResearchBody(await request.json().catch(() => ({})));
    const question = body.question;
    if (!question) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }
    const config = getAseanDeepResearchConfig();
    const context = await buildAseanResearchContext();
    const wantsStream = request.headers.get('accept')?.includes('text/event-stream') || new URL(request.url).searchParams.get('stream') === '1';
    if (!config.configured) {
      const unavailablePayload = {
        error: '研究服务暂未就绪，请稍后重试',
        generated_at: new Date().toISOString(),
        question,
        context_generated_at: context.generated_at,
        source_summary: publicSourceSummary(context.source_summary),
        validation_summary: context.validation_summary,
      };
      if (wantsStream) {
        const encoder = new TextEncoder();
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(toSse('error', unavailablePayload)));
              controller.close();
            },
          }),
          {
            headers: {
              'Cache-Control': 'no-store, max-age=0',
              'Content-Type': 'text/event-stream; charset=utf-8',
              Connection: 'keep-alive',
              'X-Accel-Buffering': 'no',
            },
          },
        );
      }
      return NextResponse.json(unavailablePayload, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }
    const messages = body.messages.length
      ? buildAseanDeepResearchConversation({ messages: body.messages, context_text: context.context_text })
      : buildAseanDeepResearchMessages({
          question,
          clarification: body.clarification || null,
          context_text: context.context_text,
        });
    if (wantsStream) {
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          async start(controller) {
            let closed = false;
            let lastPhaseKey = '';
            let lastPhaseAt = 0;
            const send = (event: string, payload: unknown) => {
              if (closed || request.signal.aborted) return;
              if (event === 'phase' && payload && typeof payload === 'object') {
                const phasePayload = payload as { phase?: unknown; status?: unknown; message?: unknown };
                const phaseKey = [phasePayload.phase, phasePayload.status, phasePayload.message].map((item) => String(item || '')).join('|');
                const now = Date.now();
                if (phaseKey === lastPhaseKey && now - lastPhaseAt < 6_000) return;
                lastPhaseKey = phaseKey;
                lastPhaseAt = now;
              }
              controller.enqueue(encoder.encode(toSse(event, payload)));
            };
            const heartbeat = setInterval(() => {
              send('phase', {
                type: 'phase',
                status: 'running',
                phase: '关联来源',
                message: '正在筛选可用公开来源',
              });
            }, 15_000);
            const close = () => {
              if (closed) return;
              closed = true;
              clearInterval(heartbeat);
              controller.close();
            };
            try {
              send('meta', {
                generated_at: new Date().toISOString(),
                question,
                context_generated_at: context.generated_at,
                source_summary: publicSourceSummary(context.source_summary),
                validation_summary: context.validation_summary,
                context_sources: context.context_sources,
              });
              send('phase', {
                type: 'phase',
                status: 'running',
                phase: '关联来源',
                message: '正在筛选可用公开来源',
              });
              const result = await runQwenDeepResearchStream(messages, (event) => {
                send(event.type, event);
              }, { signal: request.signal });
              void appendAseanResearchResult({
                question,
                content: result.content,
                model: config.model,
                references: result.references,
                web_sites: result.web_sites,
                source_count: result.source_count,
              });
              close();
            } catch (error) {
              if (request.signal.aborted) {
                close();
                return;
              }
              const sourceResearch = buildLocalSourceResearchResult({
                question,
                context,
                reason: error instanceof Error ? error.message : 'stream failed',
              });
              const savedResult = isActionableResearchQuestion(question)
                ? await appendAseanResearchResult({
                    question,
                    content: sourceResearch.content,
                    model: 'public-source-research',
                    references: sourceResearch.references,
                    source_count: sourceResearch.source_count,
                  })
                : null;
              send('phase', {
                type: 'phase',
                status: 'source_research',
                phase: '本地来源研判',
                message: '外部检索未完整返回，已使用已接入来源生成研判',
              });
              send('delta', { type: 'delta', content: sourceResearch.content });
              send('references', {
                type: 'references',
                references: sourceResearch.references,
                web_sites: sourceResearch.web_sites,
                source_count: sourceResearch.source_count,
              });
              send('done', { type: 'done', result: sourceResearch, saved_result: savedResult });
              close();
            }
          },
        }),
        {
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'Content-Type': 'text/event-stream; charset=utf-8',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        },
      );
    }
    let result = await runQwenDeepResearch(messages, { signal: request.signal });
    let model = config.model;
    if (!result.content.trim()) {
      result = buildLocalSourceResearchResult({ question, context, reason: 'empty research content' });
      model = 'public-source-research';
    }
    const saved_result = await appendAseanResearchResult({
      question,
      content: result.content,
      model,
      references: result.references,
      web_sites: result.web_sites,
      source_count: result.source_count,
    });
    return NextResponse.json(
      {
        generated_at: new Date().toISOString(),
        question,
        context_generated_at: context.generated_at,
        source_summary: publicSourceSummary(context.source_summary),
        validation_summary: context.validation_summary,
        result,
        saved_result,
      },
      {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to run ASEAN deep research',
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      },
    );
  }
}
