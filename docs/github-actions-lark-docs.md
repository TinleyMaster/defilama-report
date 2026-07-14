# GitHub Actions + 飞书云文档方案

这套方案会在 GitHub Actions 中定时执行：

1. 抓取 DefiLlama 公开数据
2. 生成当天的 NotebookLM Markdown 包
3. 将 `notebooklm/` 目录下的 `.md` 文件导入为飞书在线文档
4. 把导入结果写入当天目录下的 `lark_docs_manifest.json`
5. 向指定飞书群推送一条上传完成通知

## 已添加的文件

- Workflow: `.github/workflows/daily_defillama_to_lark_docs.yml`
- 上传脚本: `scripts/upload_notebooklm_to_lark_docs.js`
- 群通知脚本: `scripts/send_lark_group_message.js`

## Workflow 入口

```bash
npm run research-pack
npm run lark:upload-docs
```

## 你需要准备的内容

### 1. 创建飞书应用

在飞书开放平台创建一个企业自建应用，并拿到：

- `App ID`
- `App Secret`

### 2. 给应用开权限

至少需要以下能力：

- 读取和管理云空间文件
- 上传文件到云空间
- 创建导入任务
- 创建新版文档
- 删除上传的临时文件
- 以应用身份发送消息

如果缺 scope，workflow 会在调用 API 时直接报权限错误。

### 3. 准备目标文件夹

在飞书云空间里先创建一个目标根文件夹，用来放每天导入后的在线文档。

你需要做两件事：

1. 从浏览器地址栏拿到该文件夹的 `folder token`
2. 把这个文件夹共享给你的应用，并给编辑权限

这一点很关键。  
如果应用对目标根文件夹没有编辑权限，脚本就无法继续自动创建 `年/月/日` 子目录，也无法上传或导入文档。

### 4. 准备接收通知的飞书群

你还需要把这个应用的机器人加入到目标群聊，并拿到该群的 `chat_id`。

如果应用没有在群里，或者没有“以应用身份发送消息”的权限，上传成功后也无法自动发通知。

## GitHub Secrets

在 GitHub 仓库中添加这四个 secrets：

### `LARK_APP_ID`

飞书应用的 App ID。

### `LARK_APP_SECRET`

飞书应用的 App Secret。

### `LARK_DRIVE_FOLDER_TOKEN`

目标飞书根文件夹的 token。

### `LARK_NOTIFY_CHAT_ID`

接收“上传完成”通知的飞书群 `chat_id`。

## 上传行为

脚本会：

1. 找到最新的日期目录，例如 `2026-07-12`
2. 读取该目录下 `notebooklm/` 里的所有 `.md`
3. 在目标根文件夹下自动确保 `年/月/日` 三层目录存在；如果不存在就自动创建
4. 先把 `.md` 临时上传到当天的“日”文件夹
5. 再通过导入任务把这些 Markdown 转成飞书在线文档 `docx`
6. 导入成功后删除临时上传的 `.md` 文件
7. 在本地生成 `lark_docs_manifest.json`，记录目录路径、文档标题、URL、token 和告警码
8. 读取 `lark_docs_manifest.json`，向指定飞书群发送一条“上传完成”通知

也就是说，飞书里最终会形成如下目录结构，并且只保留在线文档，不会额外堆一批临时 Markdown：

```text
<根文件夹>/
  2026/
    07/
      14/
        2026-07-14 - 01_market_overview
        2026-07-14 - 02_protocol_landscape
        ...
```

## 文档命名规则

默认标题格式是：

```text
YYYY-MM-DD - 文件名
```

例如：

```text
2026-07-12 - 04_dexs
```

如果你想改标题前缀，可以设置环境变量：

```text
LARK_DOC_TITLE_PREFIX
```

## 手动触发

除了定时执行，也支持在 GitHub Actions 页面手动点击运行：

- `Actions`
- 选择 `daily-defillama-to-lark-docs`
- 点击 `Run workflow`

当前 workflow 的定时表达式是 UTC `30 23 * * *`，对应北京时间每天 `07:30`。

## 本地手动上传

如果你想先本地验证，也可以这样跑：

```bash
export LARK_APP_ID="cli_xxx"
export LARK_APP_SECRET="xxx"
export LARK_DRIVE_FOLDER_TOKEN="fldxxx"
npm run lark:upload-docs -- 2026-07-12
export LARK_NOTIFY_CHAT_ID="oc_xxx"
npm run lark:notify-group -- 2026-07-12
```

如果你只想先预览群消息内容，可以本地 dry run：

```bash
npm run lark:notify-group -- 2026-07-12 --dry-run
```

## 输出文件

上传成功后，当前日期目录下会新增：

```text
lark_docs_manifest.json
```

里面会记录每个导入后的飞书文档 URL，后续你可以直接点开。

## 当前限制

- 当前是“导入为在线文档”，不是上传原生 Markdown 文件
- 同一天如果重复运行，会再次创建同名在线文档
- 这版没有自动清理旧的同名在线文档

对你现在“每天一份研究包”的用法来说，这个限制通常是可以接受的。
