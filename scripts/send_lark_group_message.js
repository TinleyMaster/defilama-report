const fs = require("fs");
const path = require("path");

const DATE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FEISHU_BASE_URL = "https://open.feishu.cn/open-apis";
const PREVIEW_FILE_LIMIT = 5;

function latestDateDir(rootDir) {
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && DATE_DIR_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .pop();
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${text.slice(0, 500)}`);
  }
}

function buildFolderUrl(folderToken) {
  return folderToken ? `https://ucnh8sxsqjc9.feishu.cn/drive/folder/${folderToken}` : "";
}

async function getTenantAccessToken() {
  const appId = requireEnv("LARK_APP_ID");
  const appSecret = requireEnv("LARK_APP_SECRET");

  const response = await fetch(`${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });

  const json = await parseJsonResponse(response);
  if (!response.ok || json.code !== 0 || !json.tenant_access_token) {
    throw new Error(`Failed to get tenant_access_token: ${JSON.stringify(json)}`);
  }

  return json.tenant_access_token;
}

function loadManifest(rootDir, dateDirName) {
  const dateDir = path.isAbsolute(dateDirName) ? dateDirName : path.join(rootDir, dateDirName);
  const manifestPath = path.join(dateDir, "lark_docs_manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Lark docs manifest not found: ${manifestPath}`);
  }

  return {
    dateDir,
    manifestPath,
    manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")),
  };
}

function buildMessageText(manifest) {
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const previewTitles = files.slice(0, PREVIEW_FILE_LIMIT).map((item) => `- ${item.title}`);
  const remainingCount = Math.max(files.length - PREVIEW_FILE_LIMIT, 0);
  const folderUrl =
    manifest.target_folder_url || buildFolderUrl(manifest.target_folder_token || manifest.target_root_folder_token);

  const lines = [
    "DefiLlama 日报已上传到飞书",
    `日期：${manifest.date_dir || "unknown"}`,
    `目录：${manifest.target_folder_path || manifest.date_dir || "unknown"}`,
    `文档数：${files.length}`,
  ];

  if (folderUrl) {
    lines.push(`目录链接：${folderUrl}`);
  }

  if (previewTitles.length) {
    lines.push("文档预览：", ...previewTitles);
  }

  if (remainingCount > 0) {
    lines.push(`- 以及另外 ${remainingCount} 篇文档`);
  }

  return lines.join("\n");
}

async function sendGroupMessage(accessToken, chatId, text) {
  const response = await fetch(`${FEISHU_BASE_URL}/im/v1/messages?receive_id_type=chat_id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: "text",
      content: JSON.stringify({ text }),
    }),
  });

  const json = await parseJsonResponse(response);
  if (!response.ok || json.code !== 0) {
    throw new Error(`Failed to send Lark group message: ${JSON.stringify(json)}`);
  }

  return json.data || {};
}

async function main() {
  const rootDir = process.cwd();
  const cliArgs = process.argv.slice(2);
  const dryRun = cliArgs.includes("--dry-run") || process.env.LARK_NOTIFY_DRY_RUN === "1";
  const dateArg = cliArgs.find((arg) => !arg.startsWith("--"));
  const dateDirName = dateArg || process.env.LARK_UPLOAD_DATE_DIR || latestDateDir(rootDir);

  if (!dateDirName) {
    throw new Error("No dated dataset directory found.");
  }

  const { manifestPath, manifest } = loadManifest(rootDir, dateDirName);
  const messageText = buildMessageText(manifest);

  console.log(`Loaded manifest: ${manifestPath}`);
  console.log(messageText);

  if (dryRun) {
    console.log("Dry run enabled; skipping Lark group message send.");
    return;
  }

  const chatId = requireEnv("LARK_NOTIFY_CHAT_ID");
  const accessToken = await getTenantAccessToken();
  const result = await sendGroupMessage(accessToken, chatId, messageText);

  console.log(`Sent Lark group message: ${result.message_id || "ok"}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
