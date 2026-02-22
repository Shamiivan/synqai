import type { docs_v1, drive_v3 } from "googleapis";
import type {
  CreateDocument,
  GetDocument,
  InsertText,
  ReplaceText,
  ListDocuments,
} from "../baml_client";
import type { DocsToolsDependencies, DocsTools } from "@synqai/contracts";
import { classifyDocsError } from "./errors";

// ── Factory ──────────────────────────────────────────────

export function createDocsTools(dependencies: DocsToolsDependencies): DocsTools {
  const { docs, drive } = dependencies;
  return {
    handleCreateDocument: (step) => handleCreateDocument(step, docs),
    handleGetDocument: (step) => handleGetDocument(step, docs),
    handleInsertText: (step) => handleInsertText(step, docs),
    handleReplaceText: (step) => handleReplaceText(step, docs),
    handleListDocuments: (step) => handleListDocuments(step, drive),
  };
}

// ── Create ────────────────────────────────────────────────

async function handleCreateDocument(step: CreateDocument, docs: docs_v1.Docs) {
  try {
    const res = await docs.documents.create({
      requestBody: { title: step.title },
    });
    const documentId = res.data.documentId!;

    if (step.content) {
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [
            { insertText: { text: step.content, endOfSegmentLocation: {} } },
          ],
        },
      });
    }

    return {
      documentId,
      title: res.data.title!,
      url: `https://docs.google.com/document/d/${documentId}/edit`,
    };
  } catch (err) {
    return { error: classifyDocsError(err) };
  }
}

// ── Get ───────────────────────────────────────────────────

async function handleGetDocument(step: GetDocument, docs: docs_v1.Docs) {
  try {
    const res = await docs.documents.get({
      documentId: step.documentId,
      includeTabsContent: true,
    });

    const textParts: string[] = [];
    const tabs = res.data.tabs ?? [];
    for (const tab of tabs) {
      const body = tab.documentTab?.body;
      if (!body?.content) continue;
      for (const element of body.content) {
        if (element.paragraph?.elements) {
          for (const el of element.paragraph.elements) {
            if (el.textRun?.content) {
              textParts.push(el.textRun.content);
            }
          }
        }
      }
    }

    return {
      documentId: res.data.documentId,
      title: res.data.title,
      content: textParts.join(""),
    };
  } catch (err) {
    return { error: classifyDocsError(err) };
  }
}

// ── Insert Text ──────────────────────────────────────────

async function handleInsertText(step: InsertText, docs: docs_v1.Docs) {
  try {
    const request: docs_v1.Schema$Request =
      step.position === "end" || !step.position
        ? { insertText: { text: step.text, endOfSegmentLocation: {} } }
        : { insertText: { text: step.text, location: { index: parseInt(step.position, 10) } } };

    await docs.documents.batchUpdate({
      documentId: step.documentId,
      requestBody: { requests: [request] },
    });

    return { success: true, documentId: step.documentId };
  } catch (err) {
    return { error: classifyDocsError(err) };
  }
}

// ── Replace Text ─────────────────────────────────────────

async function handleReplaceText(step: ReplaceText, docs: docs_v1.Docs) {
  try {
    const res = await docs.documents.batchUpdate({
      documentId: step.documentId,
      requestBody: {
        requests: [
          {
            replaceAllText: {
              containsText: { text: step.find, matchCase: false },
              replaceText: step.replaceWith,
            },
          },
        ],
      },
    });

    const replies = res.data.replies ?? [];
    const occurrences = (replies[0] as any)?.replaceAllText?.occurrencesChanged ?? 0;

    return { success: true, documentId: step.documentId, occurrencesChanged: occurrences };
  } catch (err) {
    return { error: classifyDocsError(err) };
  }
}

// ── List Documents ───────────────────────────────────────

async function handleListDocuments(step: ListDocuments, drive: drive_v3.Drive) {
  try {
    const res = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.document' and name contains '${step.query.replace(/'/g, "\\'")}' and trashed=false`,
      fields: "files(id,name,modifiedTime,webViewLink)",
      pageSize: 20,
    });

    const documents = (res.data.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
      url: f.webViewLink,
    }));

    return { documents };
  } catch (err) {
    return { error: classifyDocsError(err) };
  }
}
