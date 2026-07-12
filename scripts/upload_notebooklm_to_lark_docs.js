const fs = require("fs");
const path = require("path");

const DATE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FEISHU_BASE_URL = "https://open.feishu.cn/open-apis";
const DEFAULT_IMPORT_TIMEOUT_MS = 180000;
const DEFAULT_POLL_INTERVAL_MS = 3000;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${text.slice(0, 500)}`);
  }
}

async function feishuJsonRequest({ url, method = "GET", accessToken, body }) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await parseJsonResponse(response);
  if (!response.ok || json.code !== 0) {
    throw new Error(`Feishu API request failed: ${method} ${url} -> ${JSON.stringify(json)}`);
  }

  return json;
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

async function uploadSourceFile(accessToken, folderToken, filePath) {
  const stats = await fs.promises.stat(filePath);
  if (stats.size > 20 * 1024 * 1024) {
    throw new Error(`Markdown file exceeds Feishu direct upload limit (20MB): ${filePath}`);
  }

  const fileName = path.basename(filePath);
  const form = new FormData();
  const fileBlob = fs.openAsBlob
    ? await fs.openAsBlob(filePath, { type: "text/markdown" })
    : new Blob([await fs.promises.readFile(filePath)], { type: "text/markdown" });

  form.append("file_name", fileName);
  form.append("parent_type", "explorer");
  form.append("parent_node", folderToken);
  form.append("size", String(stats.size));
  form.append("file", fileBlob, fileName);

  const response = await fetch(`${FEISHU_BASE_URL}/drive/v1/files/upload_all`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  const json = await parseJsonResponse(response);
  if (!response.ok || json.code !== 0 || !json.data?.file_token) {
    throw new Error(`Failed to upload markdown source file: ${JSON.stringify(json)}`);
  }

  return json.data.file_token;
}

async function createImportTask(accessToken, folderToken, fileToken, fileName, extension) {
  const json = await feishuJsonRequest({
    url: `${FEISHU_BASE_URL}/drive/v1/import_tasks`,
    method: "POST",
    accessToken,
    body: {
      file_extension: extension,
      file_token: fileToken,
      type: "docx",
      file_name: fileName,
      point: {
        mount_type: 1,
        mount_key: folderToken,
      },
    },
  });

  return json.data.ticket;
}

async function waitForImportResult(accessToken, ticket) {
  const startedAt = Date.now();
  let lastResult = null;

  while (Date.now() - startedAt < DEFAULT_IMPORT_TIMEOUT_MS) {
    const json = await feishuJsonRequest({
      url: `${FEISHU_BASE_URL}/drive/v1/import_tasks/${ticket}`,
      accessToken,
    });

    const result = json.data?.result;
    lastResult = result || lastResult;

    if (result?.token && result?.url) {
      return result;
    }

    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for import task ${ticket}. Last result: ${JSON.stringify(lastResult)}`);
}

async function deleteUploadedSourceFile(accessToken, fileToken) {
  const response = await fetch(`${FEISHU_BASE_URL}/drive/v1/files/${fileToken}?type=file`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const json = await parseJsonResponse(response);
  if (!response.ok || json.code !== 0) {
    throw new Error(`Failed to delete uploaded source file ${fileToken}: ${JSON.stringify(json)}`);
  }
}

function buildDocTitle(dateDir, filePath) {
  const baseName = path.basename(filePath, path.extname(filePath));
  const customPrefix = process.env.LARK_DOC_TITLE_PREFIX;
  const prefix = customPrefix ? customPrefix : dateDir;
  return `${prefix} - ${baseName}`;
}

async function main() {
  const rootDir = process.cwd();
  const dateDirName = process.argv[2] || process.env.LARK_UPLOAD_DATE_DIR || latestDateDir(rootDir);
  const folderToken = requireEnv("LARK_DRIVE_FOLDER_TOKEN");

  if (!dateDirName) {
    throw new Error("No dated dataset directory found.");
  }

  const dateDir = path.isAbsolute(dateDirName) ? dateDirName : path.join(rootDir, dateDirName);
  const notebooklmDir = path.join(dateDir, "notebooklm");
  if (!fs.existsSync(notebooklmDir)) {
    throw new Error(`NotebookLM directory not found: ${notebooklmDir}`);
  }

  const mdFiles = fs
    .readdirSync(notebooklmDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => path.join(notebooklmDir, name));

  if (!mdFiles.length) {
    throw new Error(`No markdown files found in ${notebooklmDir}`);
  }

  const accessToken = await getTenantAccessToken();
  const manifest = {
    date_dir: path.basename(dateDir),
    target_folder_token: folderToken,
    generated_at: new Date().toISOString(),
    files: [],
  };

  for (const filePath of mdFiles) {
    const title = buildDocTitle(path.basename(dateDir), filePath);
    const extension = path.extname(filePath).slice(1);

    console.log(`Importing ${path.basename(filePath)} -> ${title}`);

    const sourceFileToken = await uploadSourceFile(accessToken, folderToken, filePath);

    try {
      const ticket = await createImportTask(accessToken, folderToken, sourceFileToken, title, extension);
      const result = await waitForImportResult(accessToken, ticket);

      manifest.files.push({
        source_md: path.relative(rootDir, filePath),
        title,
        ticket,
        doc_token: result.token,
        url: result.url.trim(),
        warning_codes: result.extra || [],
      });

      console.log(`Created doc: ${result.url.trim()}`);
    } finally {
      await deleteUploadedSourceFile(accessToken, sourceFileToken);
    }
  }

  const manifestPath = path.join(dateDir, "lark_docs_manifest.json");
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
