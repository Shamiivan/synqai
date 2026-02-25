import type { drive_v3 } from "googleapis";
import type {
  DriveToolsDependencies, DriveTools, Artifact,
  SearchFiles, GetFile, CreateFolder, MoveFile, CopyFile,
  RenameFile, TrashFile, ShareFile, ListPermissions,
} from "@synqai/contracts";
import { classifyDriveError } from "./errors";

const FILE_FIELDS = "id,name,mimeType,fileExtension,size,modifiedTime,createdTime,parents,webViewLink,owners(displayName,emailAddress),shared,starred,trashed,shortcutDetails(targetId,targetMimeType),driveId";

// ── Factory ──────────────────────────────────────────────

export function createDriveTools(dependencies: DriveToolsDependencies): DriveTools {
  const { drive } = dependencies;
  return {
    handleSearchFiles: (step) => handleSearchFiles(step, drive),
    handleGetFile: (step) => handleGetFile(step, drive),
    handleCreateFolder: (step) => handleCreateFolder(step, drive),
    handleMoveFile: (step) => handleMoveFile(step, drive),
    handleCopyFile: (step) => handleCopyFile(step, drive),
    handleRenameFile: (step) => handleRenameFile(step, drive),
    handleTrashFile: (step) => handleTrashFile(step, drive),
    handleShareFile: (step) => handleShareFile(step, drive),
    handleListPermissions: (step) => handleListPermissions(step, drive),
  };
}

// ── Search ───────────────────────────────────────────────

async function handleSearchFiles(step: SearchFiles, drive: drive_v3.Drive) {
  try {
    const qParts: string[] = ["trashed = false"];

    if (step.folderId) {
      qParts.push(`'${step.folderId}' in parents`);
    }

    if (step.mimeTypeFilter) {
      qParts.push(`mimeType = '${step.mimeTypeFilter}'`);
    }

    if (step.query) {
      // Detect raw Drive query syntax (quoted values with operators).
      // Matches patterns like: name contains 'x', 'id' in parents, mimeType = 'x', modifiedTime > 'x'
      const isRawQuery = /'[^']*'\s+(in|contains)\s+\w+|\w+\s+(contains|=|!=|<|>)\s+'[^']*'|\bsharedWithMe\b|\bstarred\s*=/.test(step.query);
      if (isRawQuery) {
        qParts.push(step.query);
      } else {
        qParts.push(`name contains '${step.query.replace(/'/g, "\\'")}'`);
      }
    }

    const res = await drive.files.list({
      q: qParts.join(" and "),
      pageSize: step.maxResults ?? 20,
      fields: `nextPageToken,incompleteSearch,files(${FILE_FIELDS})`,
      orderBy: "modifiedTime desc",
      corpora: "allDrives",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    const files = (res.data.files ?? []).map(formatFile);
    return { files, count: files.length, incompleteSearch: res.data.incompleteSearch ?? false, artifacts: files.map(fileArtifact) };
  } catch (err) {
    return { error: classifyDriveError(err), files: [] };
  }
}

// ── Get ──────────────────────────────────────────────────

async function handleGetFile(step: GetFile, drive: drive_v3.Drive) {
  try {
    const res = await drive.files.get({
      fileId: step.fileId,
      fields: `${FILE_FIELDS},description,webContentLink,permissions(id,type,role,emailAddress,displayName)`,
      supportsAllDrives: true,
    });
    const file = formatFile(res.data);
    return { ...file, artifacts: [fileArtifact(file)] };
  } catch (err) {
    return { error: classifyDriveError(err) };
  }
}

// ── Create Folder ────────────────────────────────────────

async function handleCreateFolder(step: CreateFolder, drive: drive_v3.Drive) {
  try {
    const res = await drive.files.create({
      requestBody: {
        name: step.name,
        mimeType: "application/vnd.google-apps.folder",
        parents: step.parentId ? [step.parentId] : undefined,
      },
      fields: FILE_FIELDS,
      supportsAllDrives: true,
    });
    const file = formatFile(res.data);
    return { ...file, created: true, artifacts: [fileArtifact(file)] };
  } catch (err) {
    return { error: classifyDriveError(err) };
  }
}

// ── Move ─────────────────────────────────────────────────

async function handleMoveFile(step: MoveFile, drive: drive_v3.Drive) {
  try {
    // Get current parents to know what to remove
    const current = await drive.files.get({
      fileId: step.fileId,
      fields: "id,name,parents",
      supportsAllDrives: true,
    });
    const previousParents = (current.data.parents ?? []).join(",");

    const res = await drive.files.update({
      fileId: step.fileId,
      addParents: step.destinationFolderId,
      removeParents: previousParents,
      fields: FILE_FIELDS,
      supportsAllDrives: true,
    });
    const file = formatFile(res.data);
    return { ...file, moved: true, artifacts: [fileArtifact(file)] };
  } catch (err) {
    return { error: classifyDriveError(err) };
  }
}

// ── Copy ─────────────────────────────────────────────────

async function handleCopyFile(step: CopyFile, drive: drive_v3.Drive) {
  try {
    const res = await drive.files.copy({
      fileId: step.fileId,
      requestBody: {
        name: step.newName ?? undefined,
        parents: step.destinationFolderId ? [step.destinationFolderId] : undefined,
      },
      fields: FILE_FIELDS,
      supportsAllDrives: true,
    });
    const file = formatFile(res.data);
    return { ...file, copied: true, artifacts: [fileArtifact(file)] };
  } catch (err) {
    return { error: classifyDriveError(err) };
  }
}

// ── Rename ───────────────────────────────────────────────

async function handleRenameFile(step: RenameFile, drive: drive_v3.Drive) {
  try {
    const res = await drive.files.update({
      fileId: step.fileId,
      requestBody: { name: step.newName },
      fields: FILE_FIELDS,
      supportsAllDrives: true,
    });
    const file = formatFile(res.data);
    return { ...file, renamed: true, artifacts: [fileArtifact(file)] };
  } catch (err) {
    return { error: classifyDriveError(err) };
  }
}

// ── Trash ────────────────────────────────────────────────

async function handleTrashFile(step: TrashFile, drive: drive_v3.Drive) {
  try {
    await drive.files.update({
      fileId: step.fileId,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    });
    return { trashed: true, fileId: step.fileId };
  } catch (err) {
    return { error: classifyDriveError(err) };
  }
}

// ── Share ────────────────────────────────────────────────

async function handleShareFile(step: ShareFile, drive: drive_v3.Drive) {
  try {
    const permission: drive_v3.Schema$Permission = {
      type: step.shareType,
      role: step.role,
    };

    if (step.shareType === "user" || step.shareType === "group") {
      permission.emailAddress = step.emailOrDomain ?? undefined;
    } else if (step.shareType === "domain") {
      permission.domain = step.emailOrDomain ?? undefined;
    }

    const res = await drive.permissions.create({
      fileId: step.fileId,
      requestBody: permission,
      sendNotificationEmail: step.sendNotification ?? true,
      supportsAllDrives: true,
      fields: "id,type,role,emailAddress,displayName",
    });
    return { shared: true, permission: res.data };
  } catch (err) {
    return { error: classifyDriveError(err) };
  }
}

// ── List Permissions ─────────────────────────────────────

async function handleListPermissions(step: ListPermissions, drive: drive_v3.Drive) {
  try {
    const res = await drive.permissions.list({
      fileId: step.fileId,
      fields: "permissions(id,type,role,emailAddress,displayName,expirationTime)",
      supportsAllDrives: true,
    });
    return { permissions: res.data.permissions ?? [] };
  } catch (err) {
    return { error: classifyDriveError(err) };
  }
}

// ── Artifact Helpers ─────────────────────────────────────

function fileArtifact(f: Record<string, unknown>): Artifact {
  return {
    ref: `drive:file:${f.id}`,
    kind: "drive_file",
    domain: "drive",
    id: f.id as string,
    label: f.name as string | undefined,
    data: { mimeType: f.mimeType, webViewLink: f.webViewLink },
  };
}

// ── Helpers ──────────────────────────────────────────────

function formatFile(f: drive_v3.Schema$File) {
  const result: Record<string, unknown> = {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    fileExtension: f.fileExtension,
    size: f.size,
    modifiedTime: f.modifiedTime,
    createdTime: f.createdTime,
    parents: f.parents,
    webViewLink: f.webViewLink,
    owners: f.owners?.map((o) => ({ name: o.displayName, email: o.emailAddress })),
    shared: f.shared,
    starred: f.starred,
  };
  if (f.driveId) result.driveId = f.driveId;
  if ((f as any).description) result.description = (f as any).description;
  if ((f as any).permissions) result.permissions = (f as any).permissions;
  if (f.shortcutDetails) {
    result.shortcutTarget = {
      id: f.shortcutDetails.targetId,
      mimeType: f.shortcutDetails.targetMimeType,
    };
  }
  return result;
}
