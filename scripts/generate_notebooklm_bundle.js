const fs = require("fs");
const path = require("path");

const DATE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function latestDateDir(rootDir) {
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && DATE_DIR_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .pop();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfExists(filePath, fallback) {
  return fs.existsSync(filePath) ? readJson(filePath) : fallback;
}

function sanitizeText(text) {
  return String(text).replace(/\u0000/g, "").replace(/\uFFFD/g, "").trimEnd();
}

function readTextIfExists(filePath) {
  return fs.existsSync(filePath) ? sanitizeText(fs.readFileSync(filePath, "utf8")) : "";
}

function formatUsd(value) {
  const num = Number(value || 0);
  const abs = Math.abs(num);

  if (abs >= 1e12) return `$${(num / 1e12).toFixed(2)}t`;
  if (abs >= 1e9) return `$${(num / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `$${(num / 1e6).toFixed(2)}m`;
  if (abs >= 1e3) return `$${(num / 1e3).toFixed(2)}k`;
  return `$${num.toFixed(2)}`;
}

function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  const num = Number(value);
  return `${num >= 0 ? "+" : ""}${num.toFixed(2)}%`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function calcPctChange(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function topN(items, limit, sorter) {
  return [...items].sort(sorter).slice(0, limit);
}

function mdTable(headers, rows) {
  const safeRows = rows.length ? rows : [["n/a"]];
  const normalizedHeaders = headers;
  const lines = [
    `| ${normalizedHeaders.join(" | ")} |`,
    `| ${normalizedHeaders.map(() => "---").join(" | ")} |`,
    ...safeRows.map((row) => `| ${row.join(" | ")} |`),
  ];
  return lines.join("\n");
}

function estimateTokens(text) {
  const chars = [...text].length;
  const cjkChars = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || []).length;
  const nonCjkChars = Math.max(0, chars - cjkChars);
  return Math.ceil(cjkChars + nonCjkChars / 4);
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, `${sanitizeText(content)}\n`);
}

function buildMarketOverview(context) {
  const topChains = topN(context.chains, 15, (a, b) => (b.tvl || 0) - (a.tvl || 0));
  const topCategories = topN(context.protocolCategories, 15, (a, b) => (b.totalTvl || 0) - (a.totalTvl || 0));
  const lines = [];

  lines.push("# DefiLlama Market Overview");
  lines.push("");
  lines.push(`- 生成日期：${context.date}`);
  lines.push(`- 数据来源：公开 API + 本地整理后的 JSON`);
  lines.push(`- 适用场景：NotebookLM 导入后的全局市场问答、资金流方向判断、板块轮动研究`);
  lines.push("");
  lines.push("## 全局规模");
  lines.push("");
  lines.push(`- 协议数：${formatNumber(context.summary.sectionCounts.protocols)}`);
  lines.push(`- 链数量：${formatNumber(context.summary.sectionCounts.chains)}`);
  lines.push(`- 稳定币数量：${formatNumber(context.summary.sectionCounts.stablecoins)}`);
  lines.push(`- DEX 页面项目：${formatNumber(context.summary.sectionCounts.dexPages)}`);
  lines.push(`- Fees 页面项目：${formatNumber(context.summary.sectionCounts.feePages)}`);
  lines.push("");
  lines.push("## TVL 最高的链");
  lines.push("");
  lines.push(
    mdTable(
      ["排名", "链", "TVL", "Symbol", "Chain ID"],
      topChains.map((item, index) => [
        String(index + 1),
        item.name || "n/a",
        formatUsd(item.tvl),
        item.tokenSymbol || "n/a",
        item.chainId ? String(item.chainId) : "n/a",
      ])
    )
  );
  lines.push("");
  lines.push("## TVL 最高的协议分类");
  lines.push("");
  lines.push(
    mdTable(
      ["排名", "分类", "协议数", "分类总 TVL", "头部协议"],
      topCategories.map((item, index) => [
        String(index + 1),
        item.category,
        formatNumber(item.protocolCount),
        formatUsd(item.totalTvl),
        item.topProtocols.slice(0, 3).map((protocol) => protocol.name).join(", "),
      ])
    )
  );
  lines.push("");
  lines.push("## NotebookLM 提问建议");
  lines.push("");
  lines.push("- 哪些链和协议分类同时吸收了最多 TVL？");
  lines.push("- 过去一周里，TVL 变化最快的高质量协议来自哪些赛道？");
  lines.push("- 稳定币、DEX、Fees 数据是否支持同一个市场方向？");

  return lines.join("\n");
}

function buildProtocolLandscape(context) {
  const topProtocols = topN(context.protocols, 25, (a, b) => (b.tvl || 0) - (a.tvl || 0));
  const movers7d = context.protocols
    .filter((item) => (item.tvl || 0) >= 1e8 && item.change_7d !== null && item.change_7d !== undefined)
    .sort((a, b) => (b.change_7d || 0) - (a.change_7d || 0))
    .slice(0, 25);

  const lines = [];
  lines.push("# Protocol Landscape");
  lines.push("");
  lines.push("## TVL Top Protocols");
  lines.push("");
  lines.push(
    mdTable(
      ["排名", "协议", "分类", "主链", "TVL", "1d", "7d", "Mcap"],
      topProtocols.map((item, index) => [
        String(index + 1),
        `[${item.name}](https://defillama.com/protocol/${item.slug})`,
        item.category || "n/a",
        item.chain || "n/a",
        formatUsd(item.tvl),
        formatPct(item.change_1d),
        formatPct(item.change_7d),
        item.mcap ? formatUsd(item.mcap) : "n/a",
      ])
    )
  );
  lines.push("");
  lines.push("## 7d TVL Movers (TVL >= $100m)");
  lines.push("");
  lines.push(
    mdTable(
      ["排名", "协议", "分类", "主链", "TVL", "7d", "描述"],
      movers7d.map((item, index) => [
        String(index + 1),
        `[${item.name}](https://defillama.com/protocol/${item.slug})`,
        item.category || "n/a",
        item.chain || "n/a",
        formatUsd(item.tvl),
        formatPct(item.change_7d),
        (item.description || "").replace(/\|/g, " ").slice(0, 100) || "n/a",
      ])
    )
  );
  lines.push("");
  lines.push("## 投研观察");
  lines.push("");
  lines.push("- 这里更适合找“资金在进，但还没到大而稳”的协议。");
  lines.push("- 7d 增速一定要结合 TVL 基数看，避免被小盘项目误导。");
  lines.push("- 可优先追问：高增速协议是否集中在同一赛道、同一链、或同一种收益结构。");
  return lines.join("\n");
}

function buildStablecoins(context) {
  const stablecoins = context.stablecoins.peggedAssets.map((asset) => {
    const current = Number(asset.circulating?.peggedUSD || 0);
    const prevDay = Number(asset.circulatingPrevDay?.peggedUSD || 0);
    const prevWeek = Number(asset.circulatingPrevWeek?.peggedUSD || 0);
    const prevMonth = Number(asset.circulatingPrevMonth?.peggedUSD || 0);
    return {
      ...asset,
      current,
      change1d: calcPctChange(current, prevDay),
      change7d: calcPctChange(current, prevWeek),
      change30d: calcPctChange(current, prevMonth),
    };
  });

  const topStablecoins = topN(stablecoins, 20, (a, b) => b.current - a.current);
  const growthStablecoins = topN(
    stablecoins.filter((item) => item.current >= 1e8 && item.change7d !== null),
    20,
    (a, b) => (b.change7d || 0) - (a.change7d || 0)
  );

  const lines = [];
  lines.push("# Stablecoins");
  lines.push("");
  lines.push("## Largest Stablecoins");
  lines.push("");
  lines.push(
    mdTable(
      ["排名", "名称", "Symbol", "流通市值", "1d", "7d", "30d", "Chains"],
      topStablecoins.map((item, index) => [
        String(index + 1),
        item.name,
        item.symbol || "n/a",
        formatUsd(item.current),
        formatPct(item.change1d),
        formatPct(item.change7d),
        formatPct(item.change30d),
        formatNumber(item.chains?.length || 0),
      ])
    )
  );
  lines.push("");
  lines.push("## 7d Supply Expansion Leaders (Market Cap >= $100m)");
  lines.push("");
  lines.push(
    mdTable(
      ["排名", "名称", "Symbol", "流通市值", "7d", "30d", "Peg 类型"],
      growthStablecoins.map((item, index) => [
        String(index + 1),
        item.name,
        item.symbol || "n/a",
        formatUsd(item.current),
        formatPct(item.change7d),
        formatPct(item.change30d),
        item.pegType || "n/a",
      ])
    )
  );
  return lines.join("\n");
}

function buildMetricOverview(title, context, metricName, topLimit = 25) {
  const data = context[metricName];
  const topBy24h = topN(data.protocols || [], topLimit, (a, b) => (b.total24h || 0) - (a.total24h || 0));
  const lines = [];

  lines.push(`# ${title}`);
  lines.push("");
  lines.push("## Aggregate");
  lines.push("");
  lines.push(`- 24h：${formatUsd(data.total24h)}`);
  lines.push(`- 7d：${formatUsd(data.total7d)}`);
  lines.push(`- 30d：${formatUsd(data.total30d || 0)}`);
  lines.push(`- 1y：${formatUsd(data.total1y || 0)}`);
  if (data.change_1d !== undefined) lines.push(`- 1d Change：${formatPct(data.change_1d)}`);
  if (data.change_7d !== undefined) lines.push(`- 7d Change：${formatPct(data.change_7d)}`);
  if (data.change_1m !== undefined) lines.push(`- 1m Change：${formatPct(data.change_1m)}`);
  lines.push("");
  lines.push("## Leaders by 24h");
  lines.push("");
  lines.push(
    mdTable(
      ["排名", "项目", "分类", "24h", "7d", "30d", "1d", "7d Change"],
      topBy24h.map((item, index) => [
        String(index + 1),
        item.displayName || item.name || "n/a",
        item.category || "n/a",
        formatUsd(item.total24h),
        formatUsd(item.total7d),
        formatUsd(item.total30d || 0),
        item.change_1d !== undefined ? formatPct(item.change_1d) : "n/a",
        item.change_7d !== undefined ? formatPct(item.change_7d) : "n/a",
      ])
    )
  );
  return lines.join("\n");
}

function buildCategoryFocus(context, options) {
  const { title, category, minMoverTvl = 5e7, limit = 20, promptBullets = [] } = options;
  const items = context.protocols.filter((item) => item.category === category);
  const topByTvl = topN(items, limit, (a, b) => (b.tvl || 0) - (a.tvl || 0));
  const topMovers = topN(
    items.filter((item) => (item.tvl || 0) >= minMoverTvl && item.change_7d !== null && item.change_7d !== undefined),
    limit,
    (a, b) => (b.change_7d || 0) - (a.change_7d || 0)
  );
  const chainBreakdown = topN(
    Array.from(
      items.reduce((map, item) => {
        const key = item.chain || "Unknown";
        if (!map.has(key)) map.set(key, { chain: key, tvl: 0, protocols: 0 });
        const entry = map.get(key);
        entry.tvl += Number(item.tvl || 0);
        entry.protocols += 1;
        return map;
      }, new Map()).values()
    ),
    15,
    (a, b) => b.tvl - a.tvl
  );

  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`- 协议数量：${formatNumber(items.length)}`);
  lines.push(`- 分类总 TVL：${formatUsd(items.reduce((sum, item) => sum + Number(item.tvl || 0), 0))}`);
  lines.push("");
  lines.push("## TVL Leaders");
  lines.push("");
  lines.push(
    mdTable(
      ["排名", "协议", "主链", "TVL", "1d", "7d", "Mcap"],
      topByTvl.map((item, index) => [
        String(index + 1),
        `[${item.name}](https://defillama.com/protocol/${item.slug})`,
        item.chain || "n/a",
        formatUsd(item.tvl),
        formatPct(item.change_1d),
        formatPct(item.change_7d),
        item.mcap ? formatUsd(item.mcap) : "n/a",
      ])
    )
  );
  lines.push("");
  lines.push(`## 7d Movers (TVL >= ${formatUsd(minMoverTvl)})`);
  lines.push("");
  lines.push(
    mdTable(
      ["排名", "协议", "主链", "TVL", "7d", "描述"],
      topMovers.map((item, index) => [
        String(index + 1),
        `[${item.name}](https://defillama.com/protocol/${item.slug})`,
        item.chain || "n/a",
        formatUsd(item.tvl),
        formatPct(item.change_7d),
        (item.description || "").replace(/\|/g, " ").slice(0, 100) || "n/a",
      ])
    )
  );
  lines.push("");
  lines.push("## Chain Distribution");
  lines.push("");
  lines.push(
    mdTable(
      ["排名", "链", "协议数", "总 TVL"],
      chainBreakdown.map((item, index) => [
        String(index + 1),
        item.chain,
        formatNumber(item.protocols),
        formatUsd(item.tvl),
      ])
    )
  );
  if (promptBullets.length) {
    lines.push("");
    lines.push("## NotebookLM 提问建议");
    lines.push("");
    for (const bullet of promptBullets) lines.push(`- ${bullet}`);
  }

  return lines.join("\n");
}

function buildQualitySignals(context) {
  const feesLeaders = topN(context.feesOverview.protocols || [], 30, (a, b) => (b.total24h || 0) - (a.total24h || 0));
  const dexLeaders = topN(context.dexsOverview.protocols || [], 30, (a, b) => (b.total24h || 0) - (a.total24h || 0));
  const dexMap = new Map(
    dexLeaders.map((item) => [String(item.displayName || item.name || "").toLowerCase(), item])
  );
  const overlap = feesLeaders
    .map((item) => {
      const key = String(item.displayName || item.name || "").toLowerCase();
      const dex = dexMap.get(key);
      return dex
        ? {
            name: item.displayName || item.name || "n/a",
            fees24h: item.total24h,
            dex24h: dex.total24h,
            fees7d: item.total7d,
            dex7d: dex.total7d,
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, 15);

  const lines = [];
  lines.push("# Quality Signals");
  lines.push("");
  lines.push("## 高质量现金流候选");
  lines.push("");
  lines.push(
    mdTable(
      ["排名", "项目", "Fees 24h", "DEX 24h", "Fees 7d", "DEX 7d"],
      overlap.map((item, index) => [
        String(index + 1),
        item.name,
        formatUsd(item.fees24h),
        formatUsd(item.dex24h),
        formatUsd(item.fees7d),
        formatUsd(item.dex7d),
      ])
    )
  );
  lines.push("");
  lines.push("## 研究提示");
  lines.push("");
  lines.push("- 同时出现在 Fees 和 DEX 头部的项目，往往意味着真实使用量和变现能力更匹配。");
  lines.push("- 后续可继续追问：这些项目的收入是否可回流给代币持有人，还是只停留在协议层。");
  lines.push("- 若某项目 DEX 量大但 Fees 弱，常见原因是激励驱动、手续费过低或用户质量偏弱。");
  return lines.join("\n");
}

function buildWatchlistPages(context) {
  const lines = [];
  lines.push("# Watchlist Pages");
  lines.push("");
  lines.push("## 页面清单");
  lines.push("");
  lines.push(
    mdTable(
      ["名称", "URL", "关注点", "机会信号"],
      context.screenshotsManifest.map((item) => [
        item.name,
        `[${item.url}](${item.url})`,
        item.focus,
        item.opportunity_signal,
      ])
    )
  );
  lines.push("");
  lines.push("## 观察模板");
  lines.push("");
  lines.push(context.trendWatchlist.trim() || "- 暂无观察模板。");
  return lines.join("\n");
}

function buildTopicSnapshotDoc(snapshot) {
  const lines = [];
  lines.push(`# ${snapshot.title}`);
  lines.push("");
  if (snapshot.url) lines.push(`- 页面：${snapshot.url}`);
  if (snapshot.generatedFrom) lines.push(`- 来源：${snapshot.generatedFrom}`);
  if (snapshot.note) lines.push(`- 备注：${snapshot.note}`);
  lines.push("");

  for (const section of snapshot.sections || []) {
    lines.push(`## ${section.heading}`);
    lines.push("");
    if (section.bullets) {
      for (const bullet of section.bullets) lines.push(`- ${bullet}`);
      lines.push("");
    }
    if (section.table?.headers?.length) {
      lines.push(mdTable(section.table.headers, section.table.rows || []));
      lines.push("");
    }
    if (section.paragraphs) {
      for (const paragraph of section.paragraphs) {
        lines.push(paragraph);
        lines.push("");
      }
    }
  }

  if (snapshot.prompts?.length) {
    lines.push("## NotebookLM 提问建议");
    lines.push("");
    for (const prompt of snapshot.prompts) lines.push(`- ${prompt}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function buildInvestmentSignals(context) {
  const rwaMovers = context.protocols
    .filter((item) => item.category === "RWA" && (item.tvl || 0) >= 5e7)
    .sort((a, b) => (b.change_7d || 0) - (a.change_7d || 0))
    .slice(0, 10);

  const bridgeMovers = context.protocols
    .filter((item) => item.category === "Bridge" && (item.tvl || 0) >= 5e7)
    .sort((a, b) => (b.change_7d || 0) - (a.change_7d || 0))
    .slice(0, 10);

  const highFeeNames = topN(context.feesOverview.protocols || [], 10, (a, b) => (b.total24h || 0) - (a.total24h || 0))
    .map((item) => item.displayName || item.name)
    .join(", ");
  const stablecoinSupplyLeaders = topN(
    context.stablecoins.peggedAssets
      .map((asset) => {
        const current = Number(asset.circulating?.peggedUSD || 0);
        const prevWeek = Number(asset.circulatingPrevWeek?.peggedUSD || 0);
        return {
          name: asset.name,
          symbol: asset.symbol,
          current,
          change7d: calcPctChange(current, prevWeek),
        };
      })
      .filter((item) => item.current >= 1e8 && item.change7d !== null),
    5,
    (a, b) => (b.change7d || 0) - (a.change7d || 0)
  )
    .map((item) => `${item.symbol} (${formatPct(item.change7d)})`)
    .join(", ");

  const trendWatchlist = context.trendWatchlist.trim();
  const lines = [];

  lines.push("# Investment Signals");
  lines.push("");
  lines.push("## 自动生成观察");
  lines.push("");
  lines.push(`- RWA 方向里，7d TVL 动能最强的项目包括：${rwaMovers.map((item) => `${item.name} (${formatPct(item.change_7d)})`).join(", ") || "n/a"}。`);
  lines.push(`- Bridge 方向里，7d TVL 动能最强的项目包括：${bridgeMovers.map((item) => `${item.name} (${formatPct(item.change_7d)})`).join(", ") || "n/a"}。`);
  lines.push(`- 当前 Fees 24h 头部项目包括：${highFeeNames || "n/a"}。这类项目往往代表真实用户付费能力更强。`);
  lines.push(`- DEX 24h 总量为 ${formatUsd(context.dexsOverview.total24h)}，Fees 24h 总量为 ${formatUsd(context.feesOverview.total24h)}，两者适合联动判断风险偏好与真实使用强度。`);
  lines.push(`- 稳定币供给变化里，7d 扩张最快的高体量稳定币集中在：${stablecoinSupplyLeaders || "n/a"}。`);
  lines.push("");
  lines.push("## 人工观察模板");
  lines.push("");
  if (trendWatchlist) {
    lines.push(trendWatchlist);
  } else {
    lines.push("- 暂无额外人工观察模板。");
  }

  return lines.join("\n");
}

function writeBundle(context, bundleDir) {
  ensureDir(bundleDir);

  const docs = [
    { file: "01_market_overview.md", content: buildMarketOverview(context) },
    { file: "02_protocol_landscape.md", content: buildProtocolLandscape(context) },
    { file: "03_stablecoins.md", content: buildStablecoins(context) },
    { file: "04_dexs.md", content: buildMetricOverview("DEX Overview", context, "dexsOverview") },
    { file: "05_fees.md", content: buildMetricOverview("Fees Overview", context, "feesOverview") },
    { file: "06_liquidations.md", content: buildMetricOverview("Liquidations Overview", context, "liquidationsOverview", 10) },
    { file: "07_investment_signals.md", content: buildInvestmentSignals(context) },
    {
      file: "08_bridges.md",
      content: buildCategoryFocus(context, {
        title: "Bridges Focus",
        category: "Bridge",
        promptBullets: [
          "桥接 TVL 和 7d 动能最强的项目，是否同时指向同一条链或同一类资产？",
          "Bridge 头部协议与 Fees/DEX 热点是否出现交叉验证？",
          "哪些桥的增长更像短期事件驱动，哪些更像长期流动性迁移？",
        ],
      }),
    },
    {
      file: "09_rwa.md",
      content: buildCategoryFocus(context, {
        title: "RWA Focus",
        category: "RWA",
        promptBullets: [
          "RWA 的增量主要来自国债类、基金类还是私募信贷类资产？",
          "RWA 头部协议的增长是否集中在少数机构品牌，还是开始扩散？",
          "RWA 动能与稳定币扩张是否同步，是否说明链上美元需求在增强？",
        ],
      }),
    },
    { file: "10_quality_signals.md", content: buildQualitySignals(context) },
    { file: "11_watchlist_pages.md", content: buildWatchlistPages(context) },
  ];

  const extraTopicDocs = (context.topicSnapshots || []).map((snapshot, index) => ({
    file: `${String(index + 12).padStart(2, "0")}_${snapshot.slug}.md`,
    content: buildTopicSnapshotDoc(snapshot),
  }));
  docs.push(...extraTopicDocs);

  const writtenFiles = [];

  for (const doc of docs) {
    const targetPath = path.join(bundleDir, doc.file);
    writeText(targetPath, doc.content);
    writtenFiles.push({ ...doc, path: targetPath });
  }

  const indexContent = [
    "# DefiLlama NotebookLM Bundle",
    "",
    `- 生成日期：${context.date}`,
    `- 文档数量：${writtenFiles.length}`,
    `- 说明：本目录面向 NotebookLM 导入，优先保留结构化文本和投研摘要。`,
    "",
    "## 文档目录",
    "",
    ...writtenFiles.map((doc) => `- ${doc.file}`),
    "",
    "## 使用建议",
    "",
    "- 先导入 `99_all_in_one.md` 做全局问答。",
    "- 再按主题补充单文件，便于 NotebookLM 在回答时引用具体章节。",
    "- `token_report.md` 可用于估算当前导入体量。",
  ].join("\n");

  const indexPath = path.join(bundleDir, "index.md");
  writeText(indexPath, indexContent);

  const allInOne = [
    "# DefiLlama NotebookLM All-in-One",
    "",
    `- 生成日期：${context.date}`,
    "",
    ...writtenFiles.flatMap((doc) => ["---", "", doc.content, ""]),
  ].join("\n");
  const allInOnePath = path.join(bundleDir, "99_all_in_one.md");
  writeText(allInOnePath, allInOne);

  const fileMetrics = [indexPath, allInOnePath, ...writtenFiles.map((doc) => doc.path)].map((filePath) => {
    const text = fs.readFileSync(filePath, "utf8");
    return {
      file: path.basename(filePath),
      chars: [...text].length,
      lines: text.split("\n").length,
      estimated_tokens: estimateTokens(text),
    };
  });

  const totalTokens = fileMetrics.reduce((sum, item) => sum + item.estimated_tokens, 0);
  const totalChars = fileMetrics.reduce((sum, item) => sum + item.chars, 0);

  const tokenReport = {
    date: context.date,
    bundle_dir: bundleDir,
    heuristic: "estimated_tokens = ceil(cjk_chars + non_cjk_chars / 4)",
    note: "这是面向 GPT/NotebookLM 的近似值，不是模型官方精确计费值。",
    totals: {
      files: fileMetrics.length,
      chars: totalChars,
      estimated_tokens: totalTokens,
    },
    files: fileMetrics,
  };

  writeText(path.join(bundleDir, "token_report.json"), JSON.stringify(tokenReport, null, 2));
  writeText(
    path.join(bundleDir, "token_report.md"),
    [
      "# Token Report",
      "",
      `- 生成日期：${context.date}`,
      `- 估算公式：\`estimated_tokens = ceil(cjk_chars + non_cjk_chars / 4)\``,
      `- 总字符数：${formatNumber(totalChars)}`,
      `- 总估算 tokens：${formatNumber(totalTokens)}`,
      "",
      mdTable(
        ["文件", "字符数", "行数", "估算 tokens"],
        fileMetrics.map((item) => [
          item.file,
          formatNumber(item.chars),
          formatNumber(item.lines),
          formatNumber(item.estimated_tokens),
        ])
      ),
    ].join("\n")
  );
}

function main() {
  const rootDir = process.cwd();
  const inputArg = process.argv[2];
  const dateDirName = inputArg || latestDateDir(rootDir);

  if (!dateDirName) {
    throw new Error("No dated dataset directory found. Run the scraper first.");
  }

  const dateDir = path.isAbsolute(dateDirName) ? dateDirName : path.join(rootDir, dateDirName);
  if (!fs.existsSync(dateDir)) {
    throw new Error(`Dataset directory not found: ${dateDir}`);
  }

  const context = {
    date: path.basename(dateDir),
    summary: readJson(path.join(dateDir, "summary.json")),
    protocols: readJson(path.join(dateDir, "protocols.json")),
    chains: readJson(path.join(dateDir, "chains.json")),
    stablecoins: readJson(path.join(dateDir, "stablecoins.json")),
    dexsOverview: readJson(path.join(dateDir, "dexs_overview.json")),
    feesOverview: readJson(path.join(dateDir, "fees_overview.json")),
    liquidationsOverview: readJson(path.join(dateDir, "liquidations_overview.json")),
    protocolCategories: readJson(path.join(dateDir, "protocols_by_category.json")),
    screenshotsManifest: readJson(path.join(dateDir, "screenshots_manifest.json")),
    topicSnapshots: readJsonIfExists(path.join(dateDir, "topic_snapshots.json"), []),
    trendWatchlist: readTextIfExists(path.join(dateDir, "trend_watchlist.md")),
  };

  const bundleDir = path.join(dateDir, "notebooklm");
  writeBundle(context, bundleDir);
  console.log(`Generated NotebookLM bundle at ${bundleDir}`);
}

main();
