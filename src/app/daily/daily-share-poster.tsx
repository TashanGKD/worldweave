'use client';

import { useMemo, useRef, useState } from 'react';
import { Check, Clipboard, Download } from 'lucide-react';

type PosterSignal = {
  rank: string;
  title: string;
  summary: string;
  source: string;
  time: string;
};

type DailySharePosterProps = {
  kind: 'geo' | 'ai';
  title: string;
  eyebrow: string;
  dateLabel: string;
  digest: string;
  lead: PosterSignal | null;
  items: PosterSignal[];
};

type TextLine = {
  text: string;
  x: number;
  y: number;
  className?: string;
};

function textUnits(text: string) {
  return Array.from(text).reduce((sum, char) => sum + (/[\u3400-\u9fff]/u.test(char) ? 1 : /[A-Z0-9]/.test(char) ? 0.72 : 0.56), 0);
}

function wrapText(text: string, maxUnits: number, maxLines: number) {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  const lines: string[] = [];
  let current = '';
  let units = 0;

  for (const char of chars) {
    const nextUnits = textUnits(char);
    if (current && units + nextUnits > maxUnits) {
      if (/^[、，。；：,.!?！？;:]$/u.test(char)) {
        current += char;
        units += nextUnits;
        continue;
      }
      if (/[A-Za-z0-9]/.test(char) && /[A-Za-z0-9]$/u.test(current)) {
        const currentChars = Array.from(current);
        let wordStart = -1;
        for (let index = currentChars.length - 1; index > 0; index -= 1) {
          if (/[A-Za-z0-9]/.test(currentChars[index]) && !/[A-Za-z0-9]/.test(currentChars[index - 1])) {
            wordStart = index;
            break;
          }
        }
        if (wordStart > 0) {
          const beforeWord = currentChars.slice(0, wordStart).join('').trim();
          const word = currentChars.slice(wordStart).join('');
          if (beforeWord) {
            lines.push(beforeWord);
            current = `${word}${char}`;
            units = textUnits(current);
            if (lines.length >= maxLines) break;
            continue;
          }
        }
      }
      lines.push(current.trim());
      current = char;
      units = nextUnits;
      if (lines.length >= maxLines) break;
    } else {
      current += char;
      units += nextUnits;
    }
  }

  if (lines.length < maxLines && current.trim()) {
    lines.push(current.trim());
  }

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  if (lines.length === maxLines && chars.join('').length > lines.join('').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[，。；、,.!?！？;:：-]+$/u, '').slice(0, -1)}…`;
  }

  return lines;
}

function firstCompleteSentence(text: string, maxChars: number) {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\.{3,}/g, '…')
    .replace(/…{2,}/g, '…')
    .replace(/值得作为背景线索继续观察/u, '可以作为背景资料参考')
    .trim();
  if (!cleaned) return '';
  const sentenceMatch = cleaned.match(/^(.{8,}?[。！？!?])/u);
  if (sentenceMatch?.[1] && Array.from(sentenceMatch[1]).length <= maxChars) {
    return sentenceMatch[1];
  }
  const clauseMatch = cleaned.match(/^(.{8,}?[，；;、])/u);
  if (clauseMatch?.[1] && Array.from(clauseMatch[1]).length <= maxChars) {
    return clauseMatch[1].replace(/[，；;、]$/u, '。');
  }
  if (Array.from(cleaned).length <= maxChars) return cleaned;
  return '';
}

function trimPosterText(text: string, maxChars: number) {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\.{3,}/g, '…')
    .replace(/…{2,}/g, '…')
    .replace(/^(后续|接下来|值得|可以|需要)(重点)?(关注|观察|核实|确认|跟进)[:：，,\s]*/u, '')
    .replace(/(后续重点|值得继续|继续关注|补充线索|信号|线索)[:：，,\s]*/gu, '')
    .trim();
  const chars = Array.from(cleaned);
  if (chars.length <= maxChars) return cleaned;
  const clipped = chars
    .slice(0, Math.max(1, maxChars - 1))
    .join('')
    .replace(/[A-Za-z][A-Za-z0-9+._-]*$/u, '')
    .replace(/[，。；、,.!?！？;:：-]+$/u, '')
    .trim();
  return `${clipped || chars.slice(0, Math.max(1, maxChars - 1)).join('').trim()}…`;
}

function posterListHeadline(text: string) {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\.{3,}/g, '…')
    .replace(/…{2,}/g, '…')
    .trim();
  const sentence = cleaned.match(/^(.{8,}?[。！？!?])/u)?.[1];
  if (sentence && Array.from(sentence).length <= 70) return sentence;
  const clause = cleaned.match(/^(.{8,}?[，；;、])/u)?.[1];
  if (clause && Array.from(clause).length <= 48) {
    return clause.replace(/[，；;、]$/u, '');
  }
  if (Array.from(cleaned).length <= 70) return cleaned;
  return Array.from(cleaned)
    .slice(0, 64)
    .join('')
    .replace(/[A-Za-z][A-Za-z0-9+._-]*$/u, '')
    .replace(/[，。；、,.!?！？;:：-]+$/u, '')
    .trim();
}

function posterSmallSummary(text: string) {
  const sentence = firstCompleteSentence(text, 58);
  if (sentence) return sentence.replace(/[。！？!?]$/u, '');
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\.{3,}/g, '…')
    .replace(/…{2,}/g, '…')
    .replace(/值得作为背景线索继续观察/u, '可以作为背景资料参考')
    .trim();
  const clause = cleaned.match(/^(.{8,}?[，；;、])/u)?.[1];
  if (clause && Array.from(clause).length <= 46) return clause.replace(/[，；;、]$/u, '');
  return '正文保留完整背景';
}

function textBlock(lines: string[], x: number, y: number, lineHeight: number, className?: string): TextLine[] {
  return lines.map((text, index) => ({ text, x, y: y + index * lineHeight, className }));
}

function posterTextPayload(kind: 'geo' | 'ai', title: string, digest: string, lead: PosterSignal | null, items: PosterSignal[]) {
  const lines = [
    `#${title}`,
    digest,
    lead ? `今天最值得看：${lead.title}` : '',
    lead?.summary || '',
    ...items.map((item) => `${item.rank}. ${item.title} ${item.summary}`),
  ].filter(Boolean);
  return `${lines.join('\n')}\n\n${kind === 'ai' ? '#AI日报 #模型动态 #产品更新' : '#世界日报 #公共安全 #今日简报'}`;
}

function posterSignalKey(item: PosterSignal) {
  return item.title
    .toLowerCase()
    .replace(/[\u3000\s]+/g, ' ')
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, ' ')
    .trim();
}

function uniquePosterSignals(signals: PosterSignal[]) {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = posterSignalKey(signal) || signal.rank;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function DailySharePoster({ kind, title, eyebrow, dateLabel, digest, lead, items }: DailySharePosterProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'done' | 'copied' | 'error'>('idle');

  const isAi = kind === 'ai';
  const itemsLabel = '今日前十';
  const digestLines = wrapText(trimPosterText(digest, 54), 34, 2);
  const posterSignals = uniquePosterSignals([lead, ...items].filter((item): item is PosterSignal => Boolean(item))).slice(0, 10);
  const itemBlocks = posterSignals.map((item) => ({
    ...item,
    titleLines: wrapText(posterListHeadline(item.title), 44, 1),
    summaryLines: wrapText(posterSmallSummary(item.summary), 52, 1),
  }));
  const footerTopics = useMemo(() => {
    const source = [lead?.summary, ...items.map((item) => item.summary)].join(' ');
    if (isAi) {
      const aiTopics = [
        /模型|OpenAI|ChatGPT|Claude|Gemini|LLM|重组/u.test(source) ? '模型变化' : '',
        /产品|服务|工具|Notion|Cursor|Agent/u.test(source) ? '产品更新' : '',
        /开源|发布|推出|平台/u.test(source) ? '新工具' : '',
      ].filter(Boolean);
      return aiTopics.slice(0, 3).join(' / ') || '模型变化 / 产品更新 / 新工具';
    }
    const topics = [
      /伤亡|死亡|人员|平民/u.test(source) ? '平民安全' : '',
      /学校|儿童|搜救/u.test(source) ? '校园安全' : '',
      /外交|斡旋|外部/u.test(source) ? '外部反应' : '',
      /无人机|防空|拦截|空袭/u.test(source) ? '城市防空' : '',
    ].filter(Boolean);
    return topics.slice(0, 3).join(' / ') || '公共安全 / 关键地区 / 今日简报';
  }, [isAi, items, lead?.summary]);

  const caption = useMemo(() => posterTextPayload(kind, title, digest, lead, items), [digest, items, kind, lead, title]);

  async function downloadPoster() {
    if (!svgRef.current) return;
    setSaved('saving');
    const svg = svgRef.current;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1440;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(url);
        setSaved('error');
        window.setTimeout(() => setSaved('idle'), 1800);
        return;
      }
      context.fillStyle = '#f7fbf4';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) {
          setSaved('error');
          window.setTimeout(() => setSaved('idle'), 1800);
          return;
        }
        const pngUrl = URL.createObjectURL(pngBlob);
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `${title.replace(/\s+/g, '-')}-小红书日报.png`;
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1200);
        setSaved('done');
        window.setTimeout(() => setSaved('idle'), 1800);
      }, 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setSaved('error');
      window.setTimeout(() => setSaved('idle'), 1800);
    };
    image.src = url;
  }

  async function copyCaption() {
    setSaved('copied');
    try {
      await navigator.clipboard.writeText(caption);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = caption;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    window.setTimeout(() => setSaved('idle'), 1800);
  }

  return (
    <section className="rounded-[30px] border border-[#d4ded8] bg-white/84 p-4 shadow-[0_18px_48px_rgba(20,43,39,0.06)] lg:p-5">
      <div className="mx-auto w-full max-w-[620px]">
        <svg
          ref={svgRef}
          viewBox="0 0 1080 1440"
          role="img"
          aria-label={`${title} 小红书日报图`}
          className="aspect-[3/4] w-full rounded-[28px] border border-[#bfe6dc] bg-[#f7fbf4] shadow-[0_22px_60px_rgba(16,42,38,0.16)]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="1080" height="1440" fill="#F7FBF4" />
          <path d="M0 0H1080V242C948 204 828 209 707 249C553 300 403 318 238 278C135 253 58 212 0 164V0Z" fill="#DFF8EE" />
          <path d="M0 1212C120 1168 244 1164 374 1196C526 1234 660 1224 798 1170C906 1128 1000 1116 1080 1132V1440H0V1212Z" fill="#E7F5EC" />
          <path d="M80 346H1000" stroke="#CFE4DA" strokeWidth="2" />
          <path d="M80 1286H1000" stroke="#CFE4DA" strokeWidth="2" />
          <rect x="74" y="74" width="300" height="62" rx="31" fill="#FFFFFF" stroke="#27B69F" strokeWidth="2" />
          <text x="112" y="116" fill="#076B60" fontSize="26" fontWeight="700" fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
            {eyebrow}
          </text>
          <rect x="786" y="72" width="220" height="62" rx="31" fill="#FFFFFF" opacity="0.92" />
          <text x="896" y="112" textAnchor="middle" fill="#476A62" fontSize="24" fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
            {dateLabel}
          </text>
          <text x="80" y="222" fill="#0B201C" fontSize="82" fontWeight="800" letterSpacing="0" fontFamily="'Noto Serif SC', 'Songti SC', serif">
            {title}
          </text>
          {textBlock(digestLines, 84, 296, 36).map((line) => (
            <text key={`digest-${line.y}`} x={line.x} y={line.y} fill="#315C55" fontSize="27" fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
              {line.text}
            </text>
          ))}

          <text x="84" y="398" fill="#0B201C" fontSize="32" fontWeight="820" fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
            {itemsLabel}
          </text>
          {itemBlocks.map((item, index) => {
            const y = 474 + index * 80;
            return (
              <g key={item.rank}>
                <rect x="82" y={y - 52} width="916" height="68" rx="22" fill={index % 2 === 0 ? '#FFFFFF' : '#F1FBF6'} stroke="#D5E7DF" />
                <circle cx="126" cy={y - 18} r="24" fill="#E8F8F1" stroke="#B7DDD3" />
                <text x="126" y={y - 10} textAnchor="middle" fill="#076B60" fontSize="19" fontWeight="740" fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
                  {item.rank}
                </text>
                {item.titleLines.map((line, lineIndex) => (
                  <text key={`${item.rank}-title-${lineIndex}`} x="168" y={y - 28 + lineIndex * 24} fill="#0A1722" fontSize="21" fontWeight="780" fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
                    {line}
                  </text>
                ))}
                {item.summaryLines.map((line, lineIndex) => (
                  <text key={`${item.rank}-summary-${lineIndex}`} x="168" y={y + 2 + lineIndex * 20} fill="#526B65" fontSize="17" fontWeight="520" fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
                    {line}
                  </text>
                ))}
              </g>
            );
          })}

          <rect x="80" y="1310" width="920" height="72" rx="36" fill="#0B3F39" />
          <text x="126" y="1356" fill="#F9FBF4" fontSize="25" fontWeight="720" fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
            今日关注：{footerTopics}
          </text>
          <text x="870" y="1356" textAnchor="middle" fill="#BFEEDF" fontSize="22" fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
            WorldWeave
          </text>
        </svg>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={downloadPoster}
            className="inline-flex items-center gap-2 rounded-full border border-[#0B8F7E] bg-[#0B8F7E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#087265]"
          >
            {saved === 'done' ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {saved === 'done' ? '已生成' : saved === 'saving' ? '生成中' : saved === 'error' ? '请重试' : '保存 PNG'}
          </button>
          <button
            type="button"
            onClick={copyCaption}
            className="inline-flex items-center gap-2 rounded-full border border-[#d3ddd7] bg-white px-4 py-2 text-sm font-semibold text-[#0B201C] transition hover:border-teal-300"
          >
            {saved === 'copied' ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
            {saved === 'copied' ? '已复制' : '复制文案'}
          </button>
        </div>
      </div>
    </section>
  );
}
