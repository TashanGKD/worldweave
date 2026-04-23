import fs from 'node:fs';
import path from 'node:path';

const historyPath = path.resolve(process.cwd(), '.cache/world-runtime-history.json');

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function inferValidationStatusFromNarrative(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return 'pending';
  }

  const pendingPattern =
    /不能确认|还不能确认|下结论还太早|证据还不够|证据不足|还缺|还没有形成多信源共振|待验证|先按局部(?:扰动|事件)收住|先继续观察|继续观察|暂时只能按|如果.+我就把判断往上提|若.+我就把判断往上提/u;
  const strongFalsifiedPattern =
    /明确证伪|已经证伪|被证伪|判断不成立|这条线不成立|需要撤回|应当撤回|被推翻|已经推翻|误报|假消息|与此前判断相反|排除这一判断|不是这条线|并非这条线/u;
  const strongConfirmedPattern =
    /明确证实|已经证实|被证实|已经确认|可以确认|判断成立|证据补上了|第二来源已经出现|官方已经回应|多信源已经跟上|形成多信源共振|官方已确认|第二来源已确认/u;

  if (pendingPattern.test(normalized)) {
    return 'pending';
  }

  if (strongFalsifiedPattern.test(normalized)) {
    return 'falsified';
  }

  if (strongConfirmedPattern.test(normalized)) {
    return 'confirmed';
  }

  return 'pending';
}

function isAutoValidationInferenceNote(note) {
  const normalized = normalizeText(note);
  return (
    normalized === '本轮文字已经明确给出确认语气，系统先按已验证回写。' ||
    normalized === '本轮文字已经明确给出证伪语气，系统先按已证伪回写。'
  );
}

if (!fs.existsSync(historyPath)) {
  console.error(`Missing history file: ${historyPath}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
const reports = Array.isArray(payload.reports) ? payload.reports : [];
const touched = [];

for (const report of reports) {
  const currentStatus = report?.validation_status || 'pending';
  if (!['confirmed', 'falsified'].includes(currentStatus)) {
    continue;
  }

  if (!isAutoValidationInferenceNote(report?.validation_note)) {
    continue;
  }

  const inferred = inferValidationStatusFromNarrative([report.current_analysis, report.future_projection, report.for_your_human].join(' '));

  if (inferred === currentStatus) {
    continue;
  }

  report.validation_status = inferred;
  report.validation_note =
    inferred === 'pending'
      ? '历史修复：原自动判定偏激进，这条旧演绎已改回待确认，等待后续更明确证据。'
      : inferred === 'confirmed'
        ? '历史修复：根据正文明确确认语气，保留为已验证。'
        : '历史修复：根据正文明确证伪语气，保留为已证伪。';

  if (inferred === 'pending') {
    report.validated_at = null;
    report.validated_by_xia_id = null;
    report.validation_signal_id = null;
  }

  touched.push({
    report_id: report.report_id,
    from: currentStatus,
    to: inferred,
    region: report.region,
    created_at: report.created_at,
  });
}

fs.writeFileSync(historyPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ updated: touched.length, touched }, null, 2));
