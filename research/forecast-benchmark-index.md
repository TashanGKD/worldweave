# Forecast Benchmark Index

更新时间：2026-04-15

## 已拉到本地

### 1. ForecastBench
- 本地目录：`research/external-repos/forecastbench`
- 数据集：`research/external-repos/forecastbench-datasets`
- 类型：在线滚动 benchmark + 夜间更新 leaderboard/datasets
- 特点：动态、低污染、可和人类预测组对比
- 官方站点：https://www.forecastbench.org/
- 仓库：
  - https://github.com/forecastingresearch/forecastbench
  - https://github.com/forecastingresearch/forecastbench-datasets

### 2. AutoCast
- 本地目录：`research/external-repos/autocast`
- 类型：历史世界事件预测 benchmark / dataset
- 特点：题目来自真实 forecasting tournaments，配有按时间组织的新闻语料，适合回放和离线评测
- 论文：https://arxiv.org/abs/2206.15474
- 仓库：https://github.com/andyzoujm/autocast

### 3. AutoCast++
- 本地目录：`research/external-repos/Autocast-plus-plus`
- 类型：基于 AutoCast 的方法仓库
- 特点：更偏“怎么用检索增强提升预测”，不是新的公共 benchmark 本体
- 论文：https://arxiv.org/abs/2310.01880
- 仓库：https://github.com/BorealisAI/Autocast-plus-plus

### 4. MiroFish
- 本地目录：`research/external-repos/MiroFish`
- 类型：多智能体仿真 / 预测产品
- 特点：更适合参考“预测产品形态”和仿真工作流，不是标准 benchmark
- 仓库：https://github.com/666ghj/MiroFish

## 主要官方平台入口

### 5. Metaculus FutureEval
- 类型：在线滚动 AI forecasting benchmark
- 特点：更接近真正的实时前沿 bench，持续比较 bot / 模型 / 人类
- 官方页：https://www.metaculus.com/futureeval

### 6. Metaculus AI Benchmark
- 类型：Metaculus 的 AI forecasting 入口页
- 官方页：https://www.metaculus.com/aib/

### 7. Prophet Arena
- 类型：在线实时 forecasting benchmark / arena
- 特点：更偏 live evaluation，适合关注“滚动预测表现”
- 官方页：https://www.prophetarena.org/

## 我们当前最值得参考的顺序

1. `Metaculus FutureEval`
   - 最像“在线滚动前沿 bench”
2. `ForecastBench`
   - 最像“学术界公开、动态更新、结构清楚的 benchmark”
3. `AutoCast`
   - 最适合做离线回测 / 历史回放 / 题型设计参考
4. `Prophet Arena`
   - 值得关注，但目前更像新兴 live arena

## 对我们最有用的启发

- 不要什么都预测，应该维护一个“主话题池”
- 每个主话题下只保留少数短周期、可验证的问题
- 在线部分参考 `FutureEval / ForecastBench`
- 离线回测部分参考 `AutoCast`
- 产品形态可借 `MiroFish`，但 schema 要坚持我们的“演绎预测图”
