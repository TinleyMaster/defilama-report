const fs = require("fs");
const path = require("path");

const DATE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FEISHU_BASE_URL = "https://open.feishu.cn/open-apis";
const DEFAULT_IMPORT_TIMEOUT_MS = 180000;
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_DRIVE_PAGE_SIZE = 200;

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

function explainFeishuError(json, context = {}) {
  if (!json || typeof json !== "object") return "";

  const code = Number(json.code);
  const hints = [];

  if (code === 1061004) {
    hints.push("当前飞书应用没有目标文件夹的编辑权限。");
    if (context.folderToken) {
      hints.push(`请确认 LARK_DRIVE_FOLDER_TOKEN 指向的是文件夹 token：${context.folderToken}。`);
    }
    hints.push("请在飞书侧为该应用开通云空间相关权限。");
    hints.push("如果你使用 tenant_access_token，请把目标文件夹共享给该应用可访问的身份，并授予编辑权限。");
    hints.push("常见做法是：先给应用开启机器人能力，再把机器人加入群组，然后把文件夹共享给该群组。");
  }

  if (code === 1069908) {
    hints.push("导入挂载点不存在，或当前应用没有导入到该文件夹的权限。");
    if (context.folderToken) {
      hints.push(`请再次检查文件夹 token 是否正确：${context.folderToken}。`);
    }
    hints.push("请确认目标文件夹已经共享给应用可访问的身份，并具备编辑权限。");
  }

  if (!hints.length) return "";
  return `\nHints:\n- ${hints.join("\n- ")}`;
}

function parseDatePathParts(dateDirName) {
  const baseName = path.basename(dateDirName);
  if (!DATE_DIR_PATTERN.test(baseName)) {
    throw new Error(`Date directory must match YYYY-MM-DD: ${baseName}`);
  }

  const [year, month, day] = baseName.split("-");
  return { year, month, day, baseName };
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
    throw new Error(
      `Feishu API request failed: ${method} ${url} -> ${JSON.stringify(json)}${explainFeishuError(json, {
        folderToken: body?.point?.mount_key || body?.folder_token,
      })}`
    );
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

async function listFolderItems(accessToken, folderToken) {
  let pageToken = "";
  const items = [];

  do {
    const params = new URLSearchParams({
      folder_token: folderToken,
      page_size: String(DEFAULT_DRIVE_PAGE_SIZE),
    });

    if (pageToken) {
      params.set("page_token", pageToken);
    }

    const json = await feishuJsonRequest({
      url: `${FEISHU_BASE_URL}/drive/v1/files?${params.toString()}`,
      accessToken,
    });

    const pageItems = Array.isArray(json.data?.files) ? json.data.files : [];
    items.push(...pageItems);
    pageToken = json.data?.has_more ? json.data?.next_page_token || "" : "";
  } while (pageToken);

  return items;
}

async function findChildFolderByName(accessToken, parentFolderToken, folderName) {
  const items = await listFolderItems(accessToken, parentFolderToken);
  return items.find((item) => item.type === "folder" && item.name === folderName) || null;
}

async function createFolder(accessToken, parentFolderToken, folderName) {
  const json = await feishuJsonRequest({
    url: `${FEISHU_BASE_URL}/drive/v1/files/create_folder`,
    method: "POST",
    accessToken,
    body: {
      name: folderName,
      folder_token: parentFolderToken,
    },
  });

  return {
    token: json.data?.token,
    url: json.data?.url || "",
    name: folderName,
    parent_token: parentFolderToken,
    created: true,
  };
}

async function ensureChildFolder(accessToken, parentFolderToken, folderName) {
  const existing = await findChildFolderByName(accessToken, parentFolderToken, folderName);
  if (existing) {
    return {
      token: existing.token,
      url: existing.url || "",
      name: existing.name,
      parent_token: existing.parent_token || parentFolderToken,
      created: false,
    };
  }

  return createFolder(accessToken, parentFolderToken, folderName);
}

async function ensureDateFolders(accessToken, rootFolderToken, dateDirName) {
  const { year, month, day, baseName } = parseDatePathParts(dateDirName);
  const yearFolder = await ensureChildFolder(accessToken, rootFolderToken, year);
  const monthFolder = await ensureChildFolder(accessToken, yearFolder.token, month);
  const dayFolder = await ensureChildFolder(accessToken, monthFolder.token, day);

  return {
    yearFolder,
    monthFolder,
    dayFolder,
    pathSegments: [year, month, day],
    dateDirName: baseName,
  };
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
    throw new Error(
      `Failed to upload markdown source file: ${JSON.stringify(json)}${explainFeishuError(json, {
        folderToken,
      })}`
    );
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
  const rootFolderToken = requireEnv("LARK_DRIVE_FOLDER_TOKEN");

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
  const targetFolders = await ensureDateFolders(accessToken, rootFolderToken, path.basename(dateDir));
  const targetFolderToken = targetFolders.dayFolder.token;
  const targetFolderPath = targetFolders.pathSegments.join("/");

  console.log(`Resolved Lark target folder path: ${targetFolderPath}`);
  console.log(`Target folder token: ${targetFolderToken}`);

  const manifest = {
    date_dir: path.basename(dateDir),
    target_root_folder_token: rootFolderToken,
    target_folder_token: targetFolderToken,
    target_folder_path: targetFolderPath,
    target_folder_url: targetFolders.dayFolder.url || "",
    target_folders: {
      year: targetFolders.yearFolder,
      month: targetFolders.monthFolder,
      day: targetFolders.dayFolder,
    },
    generated_at: new Date().toISOString(),
    files: [],
  };

  for (const filePath of mdFiles) {
    const title = buildDocTitle(path.basename(dateDir), filePath);
    const extension = path.extname(filePath).slice(1);

    console.log(`Importing ${path.basename(filePath)} -> ${title}`);

    const sourceFileToken = await uploadSourceFile(accessToken, targetFolderToken, filePath);

    try {
      const ticket = await createImportTask(accessToken, targetFolderToken, sourceFileToken, title, extension);
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
