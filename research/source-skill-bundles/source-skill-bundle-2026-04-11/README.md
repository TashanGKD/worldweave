# Source Skill Bundle

打包日期：2026-04-11

## 说明

这个包收拢了当前可直接消费的信源 skill 结果：

- `source-link-registry.md`: 人可读信源总表
- `source-skill-candidates.md`: 候选与验证主表
- `all-sources.json`: 全量提取结果
- `usable-sources.json`: `direct + unstable` 可识别来源
- `direct-sources.json`: 当前环境直连来源
- `high-value-usable-sources.json`: 高价值且可直接复用的来源
- `high-value-skills.json`: 高价值 skill 概览
- `package-summary.json`: 当前打包摘要

## 当前摘要

- `completion_stage`: entering_long_tail
- `endpoint_covered`: 65 / 66
- `site_covered`: 1
- `uncovered`: 0
- `direct`: 194
- `unstable`: 72
- `blocked_or_unknown`: 15

## 推荐用法

1. 先看 `package-summary.json` 和 `high-value-skills.json`。
2. 要接入 runtime 时优先读 `high-value-usable-sources.json`。
3. 要人工核验时读 `source-link-registry.md`。

