# Contributing

## Scope

`WorldWeave` 当前以单仓形式维护，但评审范围已经收紧。

默认代码评审重点：

- `src/`
- `public/`
- `scripts/`
- `docs/`

默认不作为主评审面的内容：

- `research/source-skill-validation/`
- `.cache/`
- `.next/`
- `logs/`
- 本地虚拟环境、镜像目录和第三方快照

## Engineering Baseline

提交前至少执行：

```bash
pnpm lint
pnpm ts-check
```

如果改动涉及运行链路、技能挂载或部署脚本，补跑：

```bash
pnpm health:world
pnpm audit:world-client
pnpm audit:world-skill
```

## Directory Rules

- 新产品代码放在 `src/`
- 新脚本放在 `scripts/`
- 新架构说明和运行文档放在 `docs/`
- 新研究材料和外部参考放在 `research/`

不要把运行产物、巡检日志或外部仓库镜像提交到主分支。

## Commit Style

提交信息保持直接、可审查：

- `Tighten lint baseline`
- `Align repository metadata`
- `Refine livebench question detail page`

避免把无关研究产物和产品改动混在同一个提交中。
