# GitHub Actions + Google Drive 上传方案

这套方案会在 GitHub Actions 中定时执行：

1. 抓取 DefiLlama 公开数据
2. 生成当天的 NotebookLM Markdown 包
3. 上传 `notebooklm/` 目录下的 `.md` 文件到 Google Drive 指定父文件夹
4. 以日期目录名作为 Drive 子文件夹名，例如 `2026-07-11`

## 已添加的文件

- Workflow: `.github/workflows/daily_defillama_to_drive.yml`
- 上传脚本: `scripts/upload_notebooklm_to_drive.js`

## Workflow 入口

```bash
npm run research-pack
npm run drive:upload
```

## 推荐的认证方式

推荐使用 **Google Service Account**。

原因：

- 适合 GitHub Actions 无人值守执行
- 不依赖本地浏览器登录
- 不需要长期保存个人 OAuth refresh token

## 你需要准备的内容

### 1. 创建 Google Cloud 项目

- 打开 Google Cloud Console
- 启用 **Google Drive API**
- 创建一个 **Service Account**
- 为这个 Service Account 生成 JSON Key

### 2. 创建 Google Drive 目标文件夹

- 在你的 Google Drive 中新建一个父文件夹
- 记下该文件夹 ID
  - 例如 URL:
    `https://drive.google.com/drive/folders/abc123xyz`
  - 那么 folder ID 就是 `abc123xyz`

### 3. 把目标文件夹共享给 Service Account

把刚才的 Drive 文件夹共享给 Service Account 邮箱，至少给 `Editor` 权限。

Service Account 邮箱通常长这样：

```text
defillama-bot@your-project-id.iam.gserviceaccount.com
```

如果这一步没做，Actions 会认证成功，但上传会失败。

## GitHub Secrets

在 GitHub 仓库中添加这两个 secrets：

### `GDRIVE_PARENT_FOLDER_ID`

值为你的 Google Drive 父文件夹 ID。

### `GDRIVE_SERVICE_ACCOUNT_JSON`

值为完整的 Service Account JSON 内容，直接原样粘贴即可。

也可以改成使用 base64 版本，但当前 workflow 默认读取的是：

```text
GDRIVE_SERVICE_ACCOUNT_JSON
```

## 定时执行时间

当前 workflow 的 cron 是：

```yaml
30 1 * * *
```

因为 workflow 里设置了：

```yaml
TZ: Asia/Shanghai
```

所以整个 Node 进程会按中国时区生成日期目录。  
如果你希望更贴近每天固定的研究时间，可以后面再调 cron。

## 上传行为

上传脚本会：

- 找到最新的日期目录，例如 `2026-07-11`
- 读取该目录下 `notebooklm/` 里的所有 `.md`
- 在 Google Drive 父文件夹下创建同名日期子文件夹
- 如果同名文件已经存在，则执行覆盖更新
- 如果不存在，则新建文件

也就是说：

- 同一天重跑，不会重复堆一堆副本
- 会更新已有 md 文件

## 手动触发

除了定时执行，也支持在 GitHub Actions 页面手动点击运行：

- `Actions`
- 选择 `daily-defillama-to-drive`
- 点击 `Run workflow`

## 本地手动上传

如果你想本地测试，也可以这样跑：

```bash
export GDRIVE_PARENT_FOLDER_ID="your-folder-id"
export GDRIVE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
npm run drive:upload -- 2026-07-11
```

## 当前限制

- 现在上传到 Google Drive 的是 `notebooklm/` 下的 Markdown 文件
- 它不会自动创建 NotebookLM notebook
- 你后续可以在 NotebookLM 里从 Drive 导入这些 md 文件

如果你之后切到 NotebookLM Enterprise，再接官方 API 会更完整。
