# World 项目运行模式总览图

更新时间：2026-04-13

状态说明：这张图主要记录旧的 `world runtime` 兼容视角。到 2026-04-16 为止，首页主产品已经转向 `livebench` 驱动的“演绎预测题池”，因此这份图不再代表唯一主流程。当前主系统请优先看 `docs/architecture/deductive-prediction-reset.md`。

这张图专门讲清楚当前整个 `world` 项目的实际运行模式。

```mermaid
flowchart TB
    subgraph Sources["1. 信源输入层"]
        WM["World Monitor APIs\n/events\n/outbreaks\n/signal-markers"]
        SH["SkillHub Source Catalog\nresearch/source-skill-*"]
        SS["Selected Sources\nEastMoney / NSE / Crypto / Alpha Vantage"]
        PA["Public Anchors\nTreasury / openFDA / arXiv"]
    end

    subgraph Runtime["2. 后端运行时核心\nsrc/lib/world/runtime.ts"]
        LS["loadSignals()\n抓取 + 标准化 + 合并"]
        CL["分类与评分\nscene / severity / hotspot / exploration"]
        REL["信源可靠度映射\nsource_reliability"]
        CACHE["运行时缓存\nsignalsCache / alignments / health cooldown"]
        HISTORY["30天滚动记忆\nreports / missions / xiaTrails /\nregionHistory / topicHistory"]
    end

    subgraph API["3. 世界接口层"]
        BR["GET /api/v1/world/briefing\n选 1 条最值得推进的线索"]
        DI["POST /api/v1/world/dispatch\n沿 briefing 继续派发给虾"]
        RE["POST /api/v1/world/report\n生成/接收演绎报告"]
        ST["GET /api/v1/world/state\n返回首页世界状态"]
    end

    subgraph Shrimp["4. 虾的工作循环"]
        BCTX["收到 briefing\n1条 evidence_signal + question_now +\nwhy_here + watch_next"]
        THINK["围绕当前线索做判断\n事实 -> 判断 -> 轻量推演"]
        RPT["输出 report\npast/current/future + confidence + invalidators"]
    end

    subgraph Frontend["5. 前端展示层"]
        HOME["首页\n地球点位 / 警报板 / 演绎预测 / SkillHub目录"]
        DETAIL["单条信号详情页\n信号信息 / 原始链接 / 信源状态"]
        GLOBE["地球模式\n只看今天 / 近30天渐淡"]
    end

    subgraph Gap["6. 当前缺口与下一步"]
        VAL["验证闭环\n已验证 / 已证伪 / 待验证"]
        MEM["给虾的轻量历史卡\n最多 3-4 条摘要卡\n而不是 30 天全文回灌"]
    end

    WM --> LS
    SH --> REL
    SS --> LS
    PA --> LS

    LS --> CL
    CL --> REL
    REL --> CACHE
    CACHE --> HISTORY

    CACHE --> BR
    HISTORY --> BR

    BR --> BCTX
    BCTX --> THINK
    THINK --> RPT
    RPT --> RE
    RE --> HISTORY

    CACHE --> ST
    HISTORY --> ST

    ST --> HOME
    ST --> DETAIL
    HOME --> GLOBE

    HISTORY -.未来接入.-> VAL
    CACHE -.后续新信号比对.-> VAL
    VAL -.摘要反馈.-> MEM
    MEM -.限量带回 briefing.-> BR
    VAL -.前端可见.-> HOME
    VAL -.前端可见.-> DETAIL
```

## 一句话理解

当前系统已经形成了一个闭环：

- 多源信号进入后端
- 后端挑出一条值得推进的线索给虾
- 虾产出演绎报告
- 报告进入 30 天历史
- 前端展示今天的活跃判断

但还差最后一层：

- 过去的演绎后来到底对了没
- 这些验证结果怎样以“轻量摘要”方式再反馈给下一轮虾

这就是下一步要补上的“验证闭环层”。
