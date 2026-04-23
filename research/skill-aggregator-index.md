# 严格 SkillHub 与 Repo Collection 总表（Round 2）

更新时间：2026-04-09  
阶段目标：这一轮只补“hub 本身”。主线只保留两类入口：

- `registry / gallery / marketplace`
- `repo-collection`

不提前展开具体信源拆解。  
不把泛应用平台、控制台、资讯站混进主表。

## 主表

| platform_name | url | platform_type | domestic_ip_access | content_visibility | searchability | signal_skill_density | worth_tracking | notes |
|---|---|---|---|---|---|---|---|---|
| ClawHub | https://www.clawhub.com/skills | registry | unstable | detail_page | good | high | yes | 最标准的 skill registry 入口之一，可直接反向跳单条 skill；第二轮优先入口。 |
| ClawSkills | https://clawskills.sh/ | registry | blocked_or_unknown | listing_only | medium | high | yes | 和 OpenClaw 聚合强相关，但当前返回 403；更像镜像类 registry，值得持续盯。 |
| Coze Gallery | https://www.coze.cn/gallery | gallery | direct | detail_page | good | high | yes | 国内最值得长期跟的模板广场之一，新闻、研究、投研、知识助手类很密。 |
| LobeHub Skills Marketplace | https://lobehub.com/skills | gallery | direct | detail_page | good | high | yes | 明确的 Agent Skills Marketplace，可看分类、单条详情与下载入口；很适合作为第二轮抽样池。 |
| 魔搭 ModelScope Studios | https://modelscope.cn/studios | marketplace | direct | detail_page | good | high | yes | 国内很像“应用/Agent/模板市场”的入口，适合后续抽科技、产业、工具型 skill。 |
| 腾讯元器 Market | https://yuanqi.tencent.com/market | gallery | direct | detail_page | good | high | yes | 国内明确的智能体广场，适合后续抽资讯、研究、专业助手类 skill。 |
| Claude SkillHub | https://claudeskillhub.com/ | gallery | unstable | detail_page | good | medium | yes | 已能稳定打开，具备 browse skills、分类与热门条目的真实 marketplace 形态。 |
| SkillsMP | https://skillsmp.com/about | gallery | unstable | fulltext_or_docs | good | high | yes | 明确自称 Skills Marketplace，强调聚合 GitHub 上大量 skills，并提供搜索、分类和一键安装。 |
| SKILLS.re | https://skills.re/skills | registry | unstable | detail_page | good | high | yes | 明确的 Public Skill Registry，支持分类、标签、验证与安装，质量很高。 |
| CodeAgentSkills | https://codeagentskills.com/en | gallery | unstable | detail_page | good | medium | yes | 明确定位 Claude Code 与 Cursor Skills Marketplace，适合作为编码技能抽样入口。 |
| SkillHQ | https://skillhq.dev/ | marketplace | unstable | detail_page | good | medium | yes | 搜索结果与站点摘要都明确为 The Marketplace for Claude Code & AI Skills，适合作为付费技能市场观察点。 |
| Skillstore | https://skillstore.io/ | marketplace | unstable | detail_page | good | high | yes | 明确定位 Claude、Codex 与 Claude Code 的 AI Skills Marketplace，带一键安装和质量验证。 |
| SkillsZoo | https://www.skillszoo.com/ | marketplace | unstable | detail_page | good | high | yes | 已有搜索、热门技能与大规模目录结构，是成熟度较高的 skills marketplace。 |
| SkillX | https://skillx.one/ | marketplace | unstable | detail_page | good | high | yes | 明确展示 trending skills、分类和排行榜，更像大规模公开技能市场。 |
| SkillsForge | https://skillsforge.dev/ | marketplace | unstable | detail_page | good | medium | yes | 明确定位 Claude Code Skills Marketplace，适合作为单生态目录补充入口。 |
| AI Skills Marketplace | https://www.skills-marketplace.com/ | gallery | unstable | detail_page | good | medium | yes | 强调基于 GitHub 仓库发现、分享与审核 AI skills，适合作为社区型目录入口。 |
| SkillsAI | https://skillsauth.com/ | marketplace | unstable | detail_page | good | medium | yes | 页面摘要明确为 Agent Skills Marketplace，并直接给出 Claude Code 安装路径，适合补安装型入口。 |
| Bogen Skills | https://www.bogen.ai/skills/ | gallery | unstable | detail_page | good | medium | yes | 明确自称 AI Skills Marketplace，偏免费 Claude Code skills，适合作为公开样本池。 |
| SkillReg | https://skillreg.dev/ | registry | unstable | fulltext_or_docs | good | medium | yes | 更偏“私有 registry”与标准化文档，但对 registry 形态和企业场景有参考价值。 |
| SkillsGate | https://skillsgate.ai/ | marketplace | unstable | detail_page | good | medium | yes | 标题明确为“open marketplace for AI agent skills”，适合作为独立 marketplace 观察点。 |
| SkillScan Registry | https://skillscan.dev/ | registry | unstable | detail_page | good | medium | yes | 以安全扫描为主，但已具备公开 registry、提交和验证流，适合作为边界型 registry 入口。 |
| Agent Skills Hub | https://agentskillshub.dev/ | marketplace | unstable | detail_page | good | medium | yes | 标题明确为“Secure Marketplace for AI Agents”，更像偏企业化的技能市场。 |
| Skillgate | https://skillgate.dev/ | marketplace | unstable | detail_page | good | medium | yes | 标题明确为“AI Skills Marketplace for Agents & Teams”，适合作为团队向技能市场入口。 |
| Open Agent Skill | https://www.openagentskill.com/ | marketplace | unstable | detail_page | good | medium | yes | 标题明确为“Open Marketplace for AI Agent Skills”，和 registry/marketplace 边界接近。 |
| LLMSkills | https://llmskills.org/ | gallery | unstable | detail_page | good | high | yes | 明确定位为 Claude Skills Marketplace，支持搜索和分类，适合作为 Claude 技能抽样池。 |
| Skills.lc | https://skills.lc/ | gallery | unstable | detail_page | good | high | yes | 明确展示 open ecosystem、排行榜、安装命令与大规模技能统计，是很强的目录型入口。 |
| AgentSkillsRepo | https://agentskillsrepo.com/ | marketplace | unstable | detail_page | good | high | yes | 明确宣称 10,000+ agent skills 和分类浏览，是很强的目录型入口。 |
| SKILLS.pub | https://skills.pub/en | gallery | unstable | detail_page | good | medium | yes | 第三方 Claude Skills Marketplace，收录数较多，适合补社区型样本。 |
| Agent Skills Club | https://agent-skills.club/ | marketplace | unstable | detail_page | good | medium | yes | 明确提供 marketplace 与安装路径，适合补“可安装型” skill 入口。 |
| AgentPowers | https://agentpowers.ai/ | marketplace | unstable | detail_page | good | medium | yes | 明确提供技能搜索、安装与 MCP 接入，偏商业化但结构完整。 |
| Skillery | https://skillery.dev/ | registry | unstable | detail_page | good | medium | yes | 自称“definitive registry”，定位比 marketplace 更接近高质量 registry。 |
| Agent Skills Marketplace | https://www.agent-skills.cc/ | gallery | unstable | detail_page | good | high | yes | 明确宣称 63,000+ agent skills，兼容 Claude Code、Codex CLI 与 ChatGPT，目录型价值很高。 |
| AgentSkillsIndex | https://agentskillsindex.com/en | registry | unstable | detail_page | good | high | yes | 明确提供 6000+ skills、分类、趋势页与单条 SKILL.md 全文，Data & AI / Research 分类已经能抽出 FDA、Reddit、HF papers 等信源型条目；第二轮优先入口。 |
| MCPMarket Agent Skills | https://mcpmarket.com/tools/skills | marketplace | unstable | detail_page | good | high | yes | 明确提供 Agent Skills 目录、Top 100、分类和最新技能，页面显示 8 万级 skills，并指向 Skill.Fish 安装生态；适合作为大规模目录型抽样入口。 |
| SkillKit | https://skillkit.io/ | gallery | unstable | detail_page | good | high | yes | 明确提供 Claude Code / Codex / ChatGPT skills marketplace，Data & AI 分类和单条 SKILL.md 可读，已确认 `jina-reader` 等信源型条目。 |
| Agent-Skills.md | https://agent-skills.md/ | registry | unstable | detail_page | good | high | yes | 明确提供 6 万级 Agent Skills 索引、详情页与安装命令，已确认 `blogwatcher`、`goplaces`、`tavily` 等带真实上游的条目。 |
| Agent Skills CLI Marketplace | https://www.agentskills.in/marketplace | marketplace | unstable | detail_page | good | high | yes | Agent Skills CLI 对应的 marketplace 页面，详情页与 docs 能交叉验证 install-url / market-search 路线，适合作为程序化发现入口。 |
| SkillHub.club | https://skillhub.club/ | gallery | unstable | detail_page | good | medium | yes | 明确是 AI Agent Skills marketplace，页面有分类、搜索和热门技能，适合作为社区型补充入口。 |
| AwesomeSkills.net | https://awesomeskills.net/ | gallery | unstable | detail_page | good | medium | yes | 明确提供 skills 与 MCP tools 导航，偏跨平台目录，适合作为长尾补漏入口。 |
| AwesomeSkills.dev | https://awesomeskills.dev/ | gallery | unstable | detail_page | good | medium | yes | 搜索结果显示为 curated marketplace，可按分类探索，适合继续抽开发/数据类技能。 |
| AgentSkill.space | https://agentskill.space/ | gallery | unstable | detail_page | good | medium | yes | 明确展示 AI Agent Skills Marketplace 与大规模技能数量，适合作为目录型补充入口。 |
| AgentSkills.me | https://agentskills.me/ | gallery | unstable | detail_page | good | medium | yes | 明确显示 Agent Skills Marketplace 与分类，规模中等但可作为补漏池。 |
| Agent Skills Directory (dmgrok) | https://dmgrok.github.io/agent_skills_directory/ | registry | unstable | fulltext_or_docs | good | high | yes | 公开目录站 + `catalog.json`，已确认可枚举 800+ skill 与 raw `SKILL.md` URL，适合做程序化目录快照。 |
| AgentSkillsDB | https://agentskillsdb.com/ | gallery | unstable | detail_page | medium | medium | yes | 小型但结构清晰的 MDX skill directory，可作为低优先级补漏入口。 |
| ClawStart Skills Hub | https://useclawstart.com/skills-hub.html | gallery | direct | listing_only | medium | medium | yes | 中文 ClawHub 生态精选目录，提供中文分类说明和 `npx clawhub@latest install` 安装提示，适合作为中文用户入口补充。 |
| ClaudeSkills.info | https://claudeskills.info/zh/ | gallery | direct | detail_page | good | medium | yes | 第三方 Claude Skills Hub，展示 151+ skills、分类和搜索，适合作为中文/多语言技能目录补充。 |
| 302 Skills Hub | https://skills.302.ai/ | gallery | unstable | detail_page | good | medium | yes | 搜索结果显示提供完整 SKILL.md 预览、一键复制和优质 Claude Skills 导航；当前抓取超时，先作为中文目录补漏入口。 |
| CLSkills.in | https://clskills.in/ | gallery | unstable | detail_page | good | high | yes | Claude Skills Hub，展示 2300+ free skills、分类、预览与下载 `.md` 文件，适合作为大规模 Claude Code skill 补漏池。 |
| skills-hub.ai | https://skills-hub.ai/ | registry | unstable | detail_page | good | high | yes | 自称 open skill registry，展示 3100+ skills、CLI 搜索/安装和多来源同步，适合作为程序化发现与开放技能注册表入口。 |
| Terminal Skills | https://terminalskills.io/ | marketplace | unstable | detail_page | good | medium | yes | 偏终端与编码代理的技能市场，适合补“开发型 skill”目录。 |
| ClawSkills Registry | https://clawskills.io/ | registry | unstable | detail_page | good | medium | yes | 搜索结果显示为 curated registry，和现有 clawskills.sh 可互为对照。 |
| AiAgentBase Skills | https://aiagentbase.app/skills | gallery | unstable | detail_page | good | medium | yes | 明确提供 skills 列表页，偏 Claude Skills 和 agent skills 教程/目录混合型入口。 |
| AbsolutelySkilled | https://www.absolutelyskilled.pro/ | registry | unstable | detail_page | good | medium | yes | 自称开源 registry，偏“生产级 coding agent skills”，适合补企业/开发向入口。 |
| skillsbento | https://www.skillsbento.com/ | gallery | unstable | detail_page | medium | medium | yes | 明确面向 Claude 的 Agent Skills Marketplace，适合作为单一生态补充入口。 |
| SkillShop.sh | https://skillshop.sh/ | gallery | unstable | detail_page | medium | medium | yes | 独立 skills 目录站，名称和页面结构都更接近精品 skill shop。 |
| AI Agent Skills Marketplace | https://aiagentskills.net/ | gallery | unstable | detail_page | medium | medium | yes | 页面标题直接定位 Claude Skills Marketplace，可作为社区型目录入口。 |
| CowAgent Skill Hub | https://skill.cowagent.com/ | gallery | unstable | detail_page | good | medium | yes | 明确的中文技能库入口，但当前浏览器抓取与脚本握手都不够稳；仍适合作为中文抽样池。 |
| SkillsBot SkillHub | https://skillsbot.net/ | gallery | unstable | detail_page | medium | medium | yes | 面向智能体技能的独立 hub，但当前可达性不够稳定；适合作为中文补充入口。 |
| Agent Skill Directory | https://agent-skill.co/ | gallery | unstable | detail_page | good | medium | yes | `Agent Skill Index` 对应的 live directory，可当真实目录站使用。 |
| Anthropic Skills | https://github.com/anthropics/skills | repo-collection | unstable | fulltext_or_docs | good | high | yes | 官方公开 skills 仓库，示范性和质量都高，适合抽官方模式和高质量单条 skill。 |
| OpenAI Skills Catalog | https://github.com/openai/skills | repo-collection | unstable | fulltext_or_docs | good | medium | yes | Codex 官方 skills catalog，虽然不是 marketplace，但很适合补高质量 curated skill。 |
| VoltAgent awesome-openclaw-skills | https://github.com/VoltAgent/awesome-openclaw-skills | repo-collection | unstable | fulltext_or_docs | good | high | yes | 规模最大，README 明确聚合 5200+ OpenClaw skills，且能反向跳 registry；第二轮优先入口。 |
| sundial awesome-openclaw-skills | https://github.com/sundial-org/awesome-openclaw-skills | repo-collection | unstable | fulltext_or_docs | good | medium | yes | 规模更小，但偏“精选热门”，适合做第二层过滤。 |
| n-skills | https://github.com/numman-ali/n-skills | repo-collection | unstable | fulltext_or_docs | good | medium | yes | 跨 agent 的 curated marketplace，适合发现平台无关型 skill。 |
| Agent Skill Index | https://github.com/heilcheng/awesome-agent-skills | repo-collection | unstable | fulltext_or_docs | good | medium | yes | GitHub 索引 + live directory 双形态，适合找真实团队在用的 skill。 |
| Antigravity Awesome Skills | https://github.com/sickn33/antigravity-awesome-skills | repo-collection | unstable | fulltext_or_docs | good | high | yes | 超大规模可安装 skills 库，覆盖 Claude Code、Codex、Gemini 等，适合高密度抽样。 |
| skillmatic awesome-agent-skills | https://github.com/skillmatic-ai/awesome-agent-skills | repo-collection | unstable | fulltext_or_docs | medium | medium | yes | 偏 Agent Skills 生态资源目录，适合补标准化 skill 与跨平台线索。 |
| littleben awesomeAgentskills | https://github.com/littleben/awesomeAgentskills | repo-collection | unstable | fulltext_or_docs | medium | medium | yes | 双语 curated list，偏 Claude Code 与通用 AI agent skill。 |
| BehiSecc awesome-claude-skills | https://github.com/BehiSecc/awesome-claude-skills | repo-collection | unstable | fulltext_or_docs | medium | medium | yes | 社区型 Claude skills 列表，可与 Anthropic 官方仓做对照。 |
| ComposioHQ awesome-claude-skills | https://github.com/ComposioHQ/awesome-claude-skills | repo-collection | unstable | fulltext_or_docs | medium | medium | yes | 偏自动化、集成、工具编排技能，适合抽“可操作型” skill。 |
| travisvn awesome-claude-skills | https://github.com/travisvn/awesome-claude-skills | repo-collection | unstable | fulltext_or_docs | medium | medium | yes | 偏“资源与工具”的 Claude skills 列表，能补到更多社区维护的单条 skill 入口。 |
| VoltAgent awesome-agent-skills | https://github.com/VoltAgent/awesome-agent-skills | repo-collection | unstable | fulltext_or_docs | medium | medium | yes | 更广义的 agent skill 列表，适合补 OpenClaw 之外的通用生态。 |
| Ai-Agent-Skills | https://github.com/MoizIbnYousaf/Ai-Agent-Skills | repo-collection | unstable | fulltext_or_docs | medium | medium | yes | 主打“visual skill marketplace”与 one-click install，适合作为新型目录入口观察。 |
| public-apis | https://github.com/public-apis/public-apis | repo-collection | unstable | fulltext_or_docs | good | high | yes | 社区维护的公共 API 大目录，适合作为“从 API 目录反拆信源”的发现入口；不能整体当成单一信源，需要按主题拆到具体 API 后再入库。 |
| awesome-ai-in-finance | https://github.com/georgezouq/awesome-ai-in-finance | repo-collection | unstable | fulltext_or_docs | medium | high | yes | 金融 AI 研究、工具与代码目录，适合补金融/投研/市场预测方法与候选上游；其中多数条目是资源索引，不应直接计入实时信号。 |

## 次级表：接近 hub，但不如主表纯

| platform_name | url | why_close_but_not_pure_hub | worth_secondary_tracking |
|---|---|---|---|
| GitHub Copilot Learning Hub | https://awesome-copilot.github.com/learning-hub/what-are-agents-skills-instructions/ | 更像学习中心与文档入口，不是稳定的 skills marketplace，但会指向 skills 目录。 | yes |
| Claude Skills 360 | https://claudeskills360.com/ | 明确是 Claude Code skills bundle / marketplace，但详情与下载强依赖邮箱、付费或安装器，当前不适合作为开放抽样主池。 | yes |
| Skill Hub 中国 | https://www.skill-cn.com/ | 更像中文 Skill 实战案例和教程聚合站，不是纯 marketplace；能提供中文生态线索但不直接作为主抽样池。 | yes |
| agentskills.io | https://agentskills.io/ | 更像规范与文档站，不是 skill 列表市场，但对标准理解有价值。 | yes |
| Agent Skills CLI Marketplace Docs | https://www.agentskills.in/docs/marketplace | 虽然文档里明确描述 marketplace 与 SkillsMP，但自身更像 CLI 文档页，不是纯 hub。 | yes |
| Datawhale | https://www.datawhale.cn/ | 更像 AI 开源学习社区、课程与活动入口，目前没有看到稳定的 skill marketplace / skills gallery 结构。 | yes |
| skill.cn | https://skill.cn/ | 名称像 skill hub，但内容更偏产品与资讯，不是稳定的可安装 skill 目录。 | no |

## 当前覆盖状态

- 主表入口数：73
- `repo-collection` 数量：14
- 国内可直接访问的 `gallery / marketplace`：4
  - Coze Gallery
  - LobeHub Skills Marketplace
  - 魔搭 ModelScope Studios
  - 腾讯元器 Market
- 海外可访问但当前更适合标 `unstable` 的 marketplace / gallery：
  - Claude SkillHub
  - SkillsGate
  - SkillsAI
  - Bogen Skills
  - SkillReg
  - SkillScan Registry
  - SkillsMP
  - SKILLS.re
  - CodeAgentSkills
  - SkillHQ
  - Skillstore
  - SkillsZoo
  - SkillX
  - SkillsForge
  - AI Skills Marketplace
  - Agent Skills Hub
  - Skillgate
  - Open Agent Skill
  - LLMSkills
  - Skills.lc
  - AgentSkillsRepo
  - SKILLS.pub
  - Agent Skills Club
  - AgentPowers
  - Skillery
  - Agent Skills Marketplace
  - AgentSkillsIndex
  - MCPMarket Agent Skills
  - SkillKit
  - Agent-Skills.md
  - Agent Skills CLI Marketplace
  - SkillHub.club
  - AwesomeSkills.net
  - AwesomeSkills.dev
  - AgentSkill.space
  - AgentSkills.me
  - Agent Skills Directory (dmgrok)
  - AgentSkillsDB
  - ClawStart Skills Hub
  - ClaudeSkills.info
  - 302 Skills Hub
  - CLSkills.in
  - skills-hub.ai
  - Terminal Skills
  - ClawSkills Registry
  - AiAgentBase Skills
  - AbsolutelySkilled
  - skillsbento
  - SkillShop.sh
  - AI Agent Skills Marketplace
- 国内可访问但当前不够稳定的中文 hub：
  - CowAgent Skill Hub
  - SkillsBot SkillHub
- 严格意义上的第二轮优先抽样池：
    - VoltAgent awesome-openclaw-skills
  - n-skills
  - Agent Skill Index
  - Antigravity Awesome Skills
  - Anthropic Skills
  - ClawHub
  - Coze Gallery
  - LobeHub Skills Marketplace
  - 魔搭 ModelScope Studios
  - 腾讯元器 Market
  - Claude SkillHub
  - CowAgent Skill Hub
  - SkillsGate
  - SkillsMP
  - SKILLS.re
  - Skillstore
  - SkillsZoo
  - SkillX
  - SkillsAI
  - Bogen Skills
  - SkillScan Registry
  - Open Agent Skill
  - LLMSkills
  - Skills.lc
  - AgentSkillsRepo
    - Agent Skills Marketplace
    - Terminal Skills

## 当前判断

- 最近两轮新增主要集中在 `SkillsMP`、`SKILLS.re`、`Skillstore`、`SkillsZoo`、`SkillsAI`、`Bogen Skills`、`Claude SkillHub`、`Skills.lc` 这类二线成熟站。
- 最新补漏继续补进了 `Agent-Skills.md`、`Agent Skills CLI Marketplace`、`SkillHub.club`、`AwesomeSkills.net`、`AwesomeSkills.dev`、`AgentSkill.space`、`AgentSkills.me`、`Agent Skills Directory (dmgrok)`、`AgentSkillsDB` 等主表入口；其中 `Agent-Skills.md` 和 `dmgrok` 都有可程序化利用的详情/目录线索。
- 中文/大规模目录补漏新增 `ClawStart Skills Hub`、`ClaudeSkills.info`、`302 Skills Hub`、`CLSkills.in`、`skills-hub.ai`；其中 `skills-hub.ai` 和 `CLSkills.in` 更偏大规模开放 registry / gallery，值得后续按 Research / Data / Business 分类抽样。
- 当前第一轮 hub 入口补全进入“尾部补漏”阶段；后续若连续两轮只新增小型、弱可达或纯教程入口，可重新判定第一轮完成。

## 下一轮抽样优先顺序

1. `repo-collection`
   - VoltAgent awesome-openclaw-skills
   - n-skills
   - Agent Skill Index
   - Antigravity Awesome Skills
   - Anthropic Skills
   - OpenAI Skills Catalog
   - BehiSecc awesome-claude-skills
   - travisvn awesome-claude-skills
2. `registry / gallery / marketplace`
   - ClawHub
   - Coze Gallery
   - LobeHub Skills Marketplace
   - 魔搭 ModelScope Studios
   - 腾讯元器 Market
   - CowAgent Skill Hub
   - LLMSkills
  - AgentSkillsRepo
    - Agent Skills Marketplace
    - AgentSkillsIndex
    - MCPMarket Agent Skills
    - SkillKit
    - Agent-Skills.md
    - Agent Skills CLI Marketplace
    - Agent Skills Directory (dmgrok)
    - CLSkills.in
    - skills-hub.ai
    - Terminal Skills
   - SkillsBot SkillHub

## 为什么这版比上一版更全

- 继续保留你认可的主线入口：
  - ClawHub
  - `awesome-openclaw-skills`
  - `n-skills`
  - Coze Gallery
  - LobeHub Skills Marketplace
  - 魔搭 `studios`
  - 腾讯元器 `market`
- 新补进了更像 hub 的中文入口：
  - CowAgent Skill Hub
  - SkillsBot SkillHub
- 新补进了一批独立 marketplace / gallery：
  - SkillsGate
  - SkillsMP
  - SKILLS.re
  - CodeAgentSkills
  - SkillHQ
  - Skillstore
  - SkillsZoo
  - SkillX
  - SkillsForge
  - AI Skills Marketplace
  - Agent Skills Hub
  - Skillgate
  - Open Agent Skill
  - LLMSkills
  - AgentSkillsRepo
  - SKILLS.pub
  - Agent Skills Club
  - AgentPowers
  - Skillery
  - Agent Skills Marketplace
  - AgentSkillsIndex
  - MCPMarket Agent Skills
  - SkillKit
  - Agent-Skills.md
  - Agent Skills CLI Marketplace
  - SkillHub.club
  - AwesomeSkills.net
  - AwesomeSkills.dev
  - AgentSkill.space
  - AgentSkills.me
  - Agent Skills Directory (dmgrok)
  - AgentSkillsDB
  - ClawStart Skills Hub
  - ClaudeSkills.info
  - 302 Skills Hub
  - CLSkills.in
  - skills-hub.ai
  - Terminal Skills
  - ClawSkills Registry
  - AiAgentBase Skills
  - AbsolutelySkilled
  - skillsbento
  - SkillShop.sh
  - AI Agent Skills Marketplace
- 新补进了更多真正有抽样价值的 `repo-collection`：
  - Anthropic Skills
  - OpenAI Skills Catalog
  - Antigravity Awesome Skills
  - BehiSecc awesome-claude-skills
  - ComposioHQ awesome-claude-skills
  - travisvn awesome-claude-skills
  - VoltAgent awesome-agent-skills
  - Ai-Agent-Skills
- `TopicLab` 仍不作为主线对象。
- 泛平台和控制台仍不进主表。

## 暂不收录到主表的对象

这些对象仍可能有价值，但当前不算“严格 skillhub / repo-collection”：

- 阿里百炼
- 百度文心智能体平台
- 讯飞星火
- FastGPT
- Dify 官网 / Dify Marketplace
- OpenXLab Apps
- TopicLab SkillHub / assignable skills

原因统一是：
- 更像应用平台、控制台、生态平台或内部基座
- 不是这一轮要找的“主入口池”

## 主要依据

- https://www.clawhub.com/skills
- https://clawskills.sh/
- https://www.coze.cn/gallery
- https://lobehub.com/skills
- https://modelscope.cn/studios
- https://yuanqi.tencent.com/market
- https://skillsgate.ai/
- https://skillsauth.com/
- https://www.bogen.ai/skills/
- https://skillreg.dev/
- https://skillsmp.com/about
- https://skills.re/skills
- https://codeagentskills.com/en
- https://skillhq.dev/
- https://skillstore.io/
- https://www.skillszoo.com/
- https://skillx.one/
- https://skillsforge.dev/
- https://www.skills-marketplace.com/
- https://agentskillshub.dev/
- https://skillgate.dev/
- https://www.openagentskill.com/
- https://llmskills.org/
- https://agentskillsrepo.com/
- https://skills.pub/en
- https://agent-skills.club/
- https://agentpowers.ai/
- https://skillery.dev/
- https://www.agent-skills.cc/
- https://agentskillsindex.com/en
- https://mcpmarket.com/tools/skills
- https://skillkit.io/
- https://agent-skills.md/
- https://www.agentskills.in/marketplace
- https://skillhub.club/
- https://awesomeskills.net/
- https://awesomeskills.dev/
- https://agentskill.space/
- https://agentskills.me/
- https://dmgrok.github.io/agent_skills_directory/
- https://github.com/dmgrok/agent_skills_directory
- https://agentskillsdb.com/
- https://useclawstart.com/skills-hub.html
- https://claudeskills.info/zh/
- https://skills.302.ai/
- https://clskills.in/
- https://skills-hub.ai/
- https://claudeskills360.com/
- https://www.skill-cn.com/
- https://terminalskills.io/
- https://clawskills.io/
- https://aiagentbase.app/skills
- https://www.absolutelyskilled.pro/
- https://www.skillsbento.com/
- https://skillshop.sh/
- https://aiagentskills.net/
- https://skill.cowagent.com/
- https://skillsbot.net/
- https://agent-skill.co/
- https://github.com/anthropics/skills
- https://github.com/openai/skills
- https://github.com/VoltAgent/awesome-openclaw-skills
- https://github.com/sundial-org/awesome-openclaw-skills
- https://github.com/numman-ali/n-skills
- https://github.com/heilcheng/awesome-agent-skills
- https://github.com/sickn33/antigravity-awesome-skills
- https://github.com/skillmatic-ai/awesome-agent-skills
- https://github.com/littleben/awesomeAgentskills
- https://github.com/BehiSecc/awesome-claude-skills
- https://github.com/ComposioHQ/awesome-claude-skills
- https://github.com/travisvn/awesome-claude-skills
- https://github.com/VoltAgent/awesome-agent-skills
- https://github.com/MoizIbnYousaf/Ai-Agent-Skills
- https://awesome-copilot.github.com/learning-hub/what-are-agents-skills-instructions/
- https://agentskills.io/
