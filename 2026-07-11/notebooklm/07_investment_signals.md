# Investment Signals

## 自动生成观察

- RWA 方向里，7d TVL 动能最强的项目包括：VanEck Treasury Fund (+238.36%), Nest Credit (+34.73%), BlackRock BUIDL (+21.03%), WisdomTree (+6.89%), xStocks (+6.47%), OpenTrade (+3.91%), OnRe (+3.72%), Mantle Index Four Fund (+2.84%), Spiko (+2.19%), Sky RWA (+1.85%)。
- Bridge 方向里，7d TVL 动能最强的项目包括：Lombard BTC.b (+18.89%), OKX xBTC (+15.30%), Portal (+14.65%), Coinbase Bridge (+5.46%), Free Protocol (+4.05%), CCIP (+3.49%), SolvBTC (+3.29%), Nexus BTC (+2.73%), Echo Bridge (+2.73%), UniRouter (+2.71%)。
- 当前 Fees 24h 头部项目包括：Tether, Circle USDC, Uniswap V3, Polymarket International, Canton, Hyperliquid Perps, NOXA Fun, Saturn, PumpSwap, Maple。这类项目往往代表真实用户付费能力更强。
- DEX 24h 总量为 $6.37b，Fees 24h 总量为 $54.99m，两者适合联动判断风险偏好与真实使用强度。
- 稳定币供给变化里，7d 扩张最快的高体量稳定币集中在：BUIDL (+21.03%), crvUSD (+13.34%), USDD (+10.19%), USDGO (+4.56%), CASH (+4.49%)。

## 人工观察模板

# DefiLlama 趋势观察清单

这份清单配合 `screenshots/` 使用，适合做每天一次的快扫。

## 优先级最高

- `rwa_full.png`
  看主动市值、净流入和资产组轮动。RWA 如果不是单点上涨，而是从国债、私募信贷扩散到更多资产组，通常意味着更长周期的配置机会。
- `digital_asset_treasuries_full.png`
  看机构持仓和股票市值错配。若新增机构持续涌入，链上资产和美股相关概念标的都可能被重估。
- `bridges_full.png`
  看净流入指向哪些链。跨链流入往往比 TVL 更早反映资金真正迁移。
- `etfs_full.png`
  看 ETF 资金是否持续净流入。它适合做大级别方向确认。

## 事件驱动

- `unlocks_full.png`
  提前看未来 7 天和 30 天的供给释放压力，筛掉高解锁抛压标的。
- `governance_full.png`
  留意高频治理项目，尤其是回购、费用切换、激励削减、分红相关提案。
- `raises_full.png`
  看融资是否重新集中到某些赛道，帮助寻找一级向二级传导的题材。

## 结构变化

- `forks_full.png`
  判断哪些协议范式在扩散，适合找“原型协议”和“最强复制链”。
- `oracles_full.png`
  看预言机份额是否变化，常对应新链活跃或新应用爆发。
- `cexs_full.png`
  看中心化交易所净流入与现货成交回暖，适合判断市场总体风险偏好。
- `narratives_full.png`
  看板块热度切换，配合融资、桥接、RWA、治理页一起交叉验证。

## 一个简单日常流程

1. 先看 `etfs_full.png` 和 `cexs_full.png`，判断市场是不是在回暖。
2. 再看 `bridges_full.png`、`rwa_full.png`、`digital_asset_treasuries_full.png`，确认资金流去哪里。
3. 然后扫 `raises_full.png`、`narratives_full.png`，找新叙事。
4. 最后用 `unlocks_full.png` 和 `governance_full.png` 做风险过滤和事件催化确认。
