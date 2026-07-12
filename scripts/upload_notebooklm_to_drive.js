const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

const DATE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function latestDateDir(rootDir) {
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && DATE_DIR_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .pop();
}

function parseServiceAccount() {
  const inlineJson = process.env.GDRIVE_SERVICE_ACCOUNT_JSON;
  const base64Json = process.env.GDRIVE_SERVICE_ACCOUNT_JSON_B64;

  if (inlineJson) return JSON.parse(inlineJson);
  if (base64Json) return JSON.parse(Buffer.from(base64Json, "base64").toString("utf8"));

  throw new Error("Missing Google Drive credentials. Set GDRIVE_SERVICE_ACCOUNT_JSON or GDRIVE_SERVICE_ACCOUNT_JSON_B64.");
}

async function getDriveClient() {
  const credentials = parseServiceAccount();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

async function listChildrenByName(drive, parentId, name, mimeType) {
  const queryParts = [
    `'${parentId}' in parents`,
    `name = '${name.replace(/'/g, "\\'")}'`,
    "trashed = false",
  ];
  if (mimeType) queryParts.push(`mimeType = '${mimeType}'`);

  const response = await drive.files.list({
    q: queryParts.join(" and "),
    fields: "files(id, name, mimeType, webViewLink)",
    pageSize: 20,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return response.data.files || [];
}

async function ensureFolder(drive, parentId, name) {
  const folderMimeType = "application/vnd.google-apps.folder";
  const existing = await listChildrenByName(drive, parentId, name, folderMimeType);
  if (existing[0]) return existing[0];

  const created = await drive.files.create({
    requestBody: {
      name,
      parents: [parentId],
      mimeType: folderMimeType,
    },
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });

  return created.data;
}

async function upsertFile(drive, parentId, filePath) {
  const fileName = path.basename(filePath);
  const mimeType = "text/markdown";
  const existing = await listChildrenByName(drive, parentId, fileName, null);
  const media = {
    mimeType,
    body: fs.createReadStream(filePath),
  };

  if (existing[0]) {
    const updated = await drive.files.update({
      fileId: existing[0].id,
      media,
      fields: "id, name, webViewLink",
      supportsAllDrives: true,
    });
    return { action: "updated", ...updated.data };
  }

  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentId],
      mimeType,
    },
    media,
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });
  return { action: "created", ...created.data };
}

async function main() {
  const rootDir = process.cwd();
  const dateDirName = process.argv[2] || process.env.GDRIVE_UPLOAD_DATE_DIR || latestDateDir(rootDir);
  const parentFolderId = process.env.GDRIVE_PARENT_FOLDER_ID;

  if (!dateDirName) throw new Error("No dated dataset directory found.");
  if (!parentFolderId) throw new Error("Missing GDRIVE_PARENT_FOLDER_ID.");

  const dateDir = path.isAbsolute(dateDirName) ? dateDirName : path.join(rootDir, dateDirName);
  const notebooklmDir = path.join(dateDir, "notebooklm");
  if (!fs.existsSync(notebooklmDir)) throw new Error(`NotebookLM directory not found: ${notebooklmDir}`);

  const mdFiles = fs
    .readdirSync(notebooklmDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => path.join(notebooklmDir, name));

  if (!mdFiles.length) throw new Error(`No markdown files found in ${notebooklmDir}`);

  const drive = await getDriveClient();
  const targetFolder = await ensureFolder(drive, parentFolderId, path.basename(dateDir));

  console.log(`Uploading ${mdFiles.length} markdown files to Drive folder ${targetFolder.name} (${targetFolder.id})`);
  for (const filePath of mdFiles) {
    const result = await upsertFile(drive, targetFolder.id, filePath);
    console.log(`${result.action}: ${result.name}`);
  }

  const folderUrl = `https://drive.google.com/drive/folders/${targetFolder.id}`;
  console.log(`Drive folder URL: ${folderUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
