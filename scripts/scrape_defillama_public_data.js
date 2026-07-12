const fs = require("fs");
const path = require("path");
const https = require("https");

const TODAY = new Date().toLocaleDateString("sv-SE");
const OUTPUT_DIR = path.join(process.cwd(), TODAY);

const DATASETS = {
  app_metadata_total_tracked_by_metric: "https://api.llama.fi/config/smol/appMetadata-totalTrackedByMetric.json",
  protocols: "https://api.llama.fi/protocols",
  chains: "https://api.llama.fi/chains",
  stablecoins: "https://stablecoins.llama.fi/stablecoins?includePrices=true",
  dexs_overview: "https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyVolume",
  fees_overview: "https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyFees",
  liquidations_overview: "https://api.llama.fi/overview/liquidations?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true",
};

const TOP_LEVEL_SITEMAPS = [
  "https://defillama.com/sitemap/static.xml",
  "https://defillama.com/sitemap/chains.xml",
  "https://defillama.com/sitemap/protocols.xml",
  "https://defillama.com/sitemap/protocols-by-category.xml",
  "https://defillama.com/sitemap/stablecoins.xml",
  "https://defillama.com/sitemap/cexs.xml",
  "https://defillama.com/sitemap/bridges.xml",
  "https://defillama.com/sitemap/rwa.xml",
  "https://defillama.com/sitemap/dat.xml",
  "https://defillama.com/sitemap/oracles.xml",
  "https://defillama.com/sitemap/liquidations.xml",
  "https://defillama.com/sitemap/unlocks.xml",
  "https://defillama.com/sitemap/governance.xml",
  "https://defillama.com/sitemap/forks.xml",
  "https://defillama.com/sitemap/raises.xml",
  "https://defillama.com/sitemap/narratives.xml",
  "https://defillama.com/sitemap/pro-dashboards.xml",
  "https://defillama.com/research/sitemap.xml",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestText(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; DefiLlamaDataCollector/1.0)",
          accept: "application/json,text/plain,*/*",
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        const location = res.headers.location;

        if ([301, 302, 303, 307, 308].includes(status) && location) {
          if (redirectCount > 5) {
            reject(new Error(`Too many redirects for ${url}`));
            res.resume();
            return;
          }
          const nextUrl = new URL(location, url).toString();
          res.resume();
          resolve(requestText(nextUrl, redirectCount + 1));
          return;
        }

        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (status < 200 || status >= 300) {
            reject(new Error(`HTTP ${status} for ${url}: ${body.slice(0, 200)}`));
            return;
          }
          resolve({ url, body, headers: res.headers });
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(60000, () => {
      req.destroy(new Error(`Timeout for ${url}`));
    });
  });
}

async function fetchJsonWithRetry(url, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await requestText(url);
      return JSON.parse(response.body);
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await sleep(1000 * (i + 1));
      }
    }
  }
  throw lastError;
}

function writeJson(fileName, data) {
  const fullPath = path.join(OUTPUT_DIR, fileName);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
  return fullPath;
}

function writeText(fileName, content) {
  const fullPath = path.join(OUTPUT_DIR, fileName);
  fs.writeFileSync(fullPath, content);
  return fullPath;
}

function groupProtocolsByCategory(protocols) {
  const grouped = new Map();

  for (const protocol of protocols) {
    const category = protocol.category || "Unknown";
    if (!grouped.has(category)) {
      grouped.set(category, {
        category,
        protocolCount: 0,
        totalTvl: 0,
        topProtocols: [],
      });
    }

    const entry = grouped.get(category);
    entry.protocolCount += 1;
    entry.totalTvl += Number(protocol.tvl || 0);
    entry.topProtocols.push({
      name: protocol.name,
      slug: protocol.slug,
      pageUrl: protocol.slug ? `https://defillama.com/protocol/${protocol.slug}` : null,
      tvl: Number(protocol.tvl || 0),
      chain: protocol.chain || null,
    });
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      ...entry,
      totalTvl: Number(entry.totalTvl.toFixed(2)),
      topProtocols: entry.topProtocols
        .sort((a, b) => b.tvl - a.tvl)
        .slice(0, 20),
    }))
    .sort((a, b) => b.totalTvl - a.totalTvl);
}

function buildProtocolRoutes(protocols) {
  return protocols
    .filter((protocol) => protocol.slug)
    .map((protocol) => ({
      id: protocol.id,
      name: protocol.name,
      slug: protocol.slug,
      pageUrl: `https://defillama.com/protocol/${protocol.slug}`,
      category: protocol.category || null,
      chain: protocol.chain || null,
      tvl: Number(protocol.tvl || 0),
    }))
    .sort((a, b) => b.tvl - a.tvl);
}

function buildTopLevelSummary(data) {
  return {
    generatedAt: new Date().toISOString(),
    folder: TODAY,
    sectionCounts: {
      protocols: data.protocols.length,
      chains: data.chains.length,
      stablecoins: data.stablecoins.peggedAssets.length,
      dexPages: data.dexs_overview.protocols?.length || 0,
      feePages: data.fees_overview.protocols?.length || 0,
      liquidationPages: data.liquidations_overview.protocols?.length || 0,
      protocolCategories: data.protocols_by_category.length,
      protocolRoutes: data.protocol_routes.length,
    },
    sources: Object.entries(DATASETS).map(([name, url]) => ({ name, url })),
    knownTopLevelSitemaps: TOP_LEVEL_SITEMAPS,
    notes: [
      "本次产物优先保存 DefiLlama 公开可访问的数据接口，它们覆盖了大部分协议页、链页、稳定币页和排行榜页的数据底座。",
      "部分站内栏目存在 Cloudflare 或订阅限制，脚本会记录已使用的公开源，但不会伪造不可访问的数据。",
      "protocol_routes.json 可直接映射到大多数协议详情页 URL。",
    ],
  };
}

function buildReadme(summary) {
  return `# DefiLlama 抓取结果\n\n生成时间：${summary.generatedAt}\n输出目录：${summary.folder}\n\n## 已保存的数据文件\n- app_metadata_total_tracked_by_metric.json\n- protocols.json\n- protocol_routes.json\n- protocols_by_category.json\n- chains.json\n- stablecoins.json\n- dexs_overview.json\n- fees_overview.json\n- liquidations_overview.json\n- sitemap_index.json\n- summary.json\n\n## 说明\n- 本次抓取基于 DefiLlama 公开接口与首页公开 sitemap 索引信息整理。\n- 由于站点对直接抓取 HTML 有 Cloudflare 防护，脚本优先保存可稳定复现的公开数据源。\n- 若你后续要继续扩展到某一类详情页，可以从 protocol_routes.json 或对应 overview 文件继续增量抓取。\n\n## 主要数量\n- 协议页：${summary.sectionCounts.protocols}\n- 协议路由：${summary.sectionCounts.protocolRoutes}\n- 协议分类页：${summary.sectionCounts.protocolCategories}\n- 链页：${summary.sectionCounts.chains}\n- 稳定币页：${summary.sectionCounts.stablecoins}\n- DEX 排行页项目：${summary.sectionCounts.dexPages}\n- Fees 排行页项目：${summary.sectionCounts.feePages}\n- Liquidations 排行页项目：${summary.sectionCounts.liquidationPages}\n`;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const collected = {};
  for (const [name, url] of Object.entries(DATASETS)) {
    console.log(`Fetching ${name}...`);
    collected[name] = await fetchJsonWithRetry(url);
    writeJson(`${name}.json`, collected[name]);
  }

  collected.protocol_routes = buildProtocolRoutes(collected.protocols);
  collected.protocols_by_category = groupProtocolsByCategory(collected.protocols);

  writeJson("protocol_routes.json", collected.protocol_routes);
  writeJson("protocols_by_category.json", collected.protocols_by_category);
  writeJson("sitemap_index.json", {
    sitemapIndex: "https://defillama.com/sitemap.xml",
    additionalSitemapIndexes: ["https://defillama.com/research/sitemap.xml"],
    sitemaps: TOP_LEVEL_SITEMAPS,
  });

  const summary = buildTopLevelSummary(collected);
  writeJson("summary.json", summary);
  writeText("README.md", buildReadme(summary));

  console.log(`Saved DefiLlama datasets to ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
