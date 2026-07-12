# DefiLlama 抓取结果

生成时间：2026-07-11T12:25:37.319Z
输出目录：2026-07-11

## 已保存的数据文件

- protocols.json
- protocols_by_category.json
- chains.json
- stablecoins.json
- dexs_overview.json
- fees_overview.json
- liquidations_overview.json
- summary.json
- screenshots_manifest.json
- topic_snapshots.json
- trend_watchlist.md

## 说明

- 本次抓取基于 DefiLlama 公开接口与首页公开 sitemap 索引信息整理。
- 由于站点对直接抓取 HTML 有 Cloudflare 防护，脚本优先保存可稳定复现的公开数据源。
- 若你后续要继续扩展到某一类详情页，可以从 protocol_routes.json 或对应 overview 文件继续增量抓取。

## NotebookLM 导入包

- 目录：`notebooklm/`
- 一键生成：`npm run notebooklm`
- 全流程生成：`npm run research-pack`
- 合并版文档：`notebooklm/99_all_in_one.md`
- token 估算：`notebooklm/token_report.md`
- 主题快照源：`topic_snapshots.json`
- token 公式：`estimated_tokens = ceil(cjk_chars + non_cjk_chars / 4)`
- 当前这套 Markdown 包总估算 tokens：约 `27880`
- 当前主题页已覆盖：市场总览、协议、稳定币、DEX、Fees、Liquidations、Bridges、RWA、CEXs、ETFs、Raises、Unlocks、DAT、Oracles、Forks、Governance

## 主要数量

- 协议页：7819
- 协议路由：7819
- 协议分类页：101
- 链页：474
- 稳定币页：410
- DEX 排行页项目：1226
- Fees 排行页项目：2391
- Liquidations 排行页项目：4
