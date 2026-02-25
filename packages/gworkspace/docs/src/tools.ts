import type { docs_v1, drive_v3 } from "googleapis";
import type {
  CreateDocument,
  GetDocument,
  InsertText,
  ReplaceText,
  ListDocuments,
  FormatText,
  FormatParagraph,
} from "../baml_client";
import type { DocsToolsDependencies, DocsTools, Artifact } from "@synqai/contracts";
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
    handleFormatText: (step) => handleFormatText(step, docs),
    handleFormatParagraph: (step) => handleFormatParagraph(step, docs),
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

    const result = {
      documentId,
      title: res.data.title!,
      url: `https://docs.google.com/document/d/${documentId}/edit`,
    };
    const artifacts: Artifact[] = [{
      ref: `docs:doc:${documentId}`,
      kind: "doc",
      domain: "docs",
      id: documentId,
      label: result.title,
      data: { url: result.url },
    }];
    return { ...result, artifacts };
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

    const result = {
      documentId: res.data.documentId,
      title: res.data.title,
      content: textParts.join(""),
    };
    const artifacts: Artifact[] = result.documentId ? [{
      ref: `docs:doc:${result.documentId}`,
      kind: "doc",
      domain: "docs",
      id: result.documentId,
      label: result.title || undefined,
    }] : [];
    return { ...result, artifacts };
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

    const artifacts: Artifact[] = documents
      .filter((d) => d.id)
      .map((d) => ({
        ref: `docs:doc:${d.id}`,
        kind: "doc" as const,
        domain: "docs" as const,
        id: d.id!,
        label: d.name || undefined,
        data: { url: d.url },
      }));
    return { documents, artifacts };
  } catch (err) {
    return { error: classifyDocsError(err) };
  }
}

// ── Target Resolution ───────────────────────────────────
// Resolves "title", "first paragraph", or a text match to {startIndex, endIndex}.

interface TextRange {
  startIndex: number;
  endIndex: number;
}

async function resolveTarget(
  target: string,
  documentId: string,
  docs: docs_v1.Docs,
): Promise<TextRange | { error: string }> {
  const res = await docs.documents.get({ documentId, includeTabsContent: true });
  const body = res.data.tabs?.[0]?.documentTab?.body;
  if (!body?.content) return { error: "Document has no content" };

  // Collect paragraphs with their indices
  const paragraphs: { text: string; startIndex: number; endIndex: number }[] = [];
  for (const el of body.content) {
    if (!el.paragraph?.elements) continue;
    const start = el.startIndex ?? 0;
    const end = el.endIndex ?? start;
    let text = "";
    for (const run of el.paragraph.elements) {
      if (run.textRun?.content) text += run.textRun.content;
    }
    if (text.trim()) paragraphs.push({ text, startIndex: start, endIndex: end });
  }

  if (paragraphs.length === 0) return { error: "Document has no text" };

  const lowerTarget = target.toLowerCase();

  if (lowerTarget === "title") {
    return { startIndex: paragraphs[0].startIndex, endIndex: paragraphs[0].endIndex };
  }

  if (lowerTarget === "first paragraph") {
    const p = paragraphs.length > 1 ? paragraphs[1] : paragraphs[0];
    return { startIndex: p.startIndex, endIndex: p.endIndex };
  }

  // Text match — concatenate all text, find offset, map back to doc indices
  let fullText = "";
  const spans: { docStart: number; textStart: number; length: number }[] = [];
  for (const el of body.content) {
    if (!el.paragraph?.elements) continue;
    for (const run of el.paragraph.elements) {
      if (run.textRun?.content) {
        const docStart = run.startIndex ?? 0;
        spans.push({ docStart, textStart: fullText.length, length: run.textRun.content.length });
        fullText += run.textRun.content;
      }
    }
  }

  const matchIdx = fullText.toLowerCase().indexOf(lowerTarget);
  if (matchIdx === -1) return { error: `Text "${target}" not found in document` };

  const matchEnd = matchIdx + target.length;

  // Map text offset back to document indices
  let docStartIdx = 0;
  let docEndIdx = 0;
  for (const span of spans) {
    const spanEnd = span.textStart + span.length;
    if (matchIdx >= span.textStart && matchIdx < spanEnd) {
      docStartIdx = span.docStart + (matchIdx - span.textStart);
    }
    if (matchEnd > span.textStart && matchEnd <= spanEnd) {
      docEndIdx = span.docStart + (matchEnd - span.textStart);
    }
  }

  if (docEndIdx <= docStartIdx) return { error: `Could not resolve indices for "${target}"` };
  return { startIndex: docStartIdx, endIndex: docEndIdx };
}

// ── Format Text ─────────────────────────────────────────

async function handleFormatText(step: FormatText, docs: docs_v1.Docs) {
  try {
    const range = await resolveTarget(step.target, step.documentId, docs);
    if ("error" in range) return { error: { code: "invalid", reason: "target_not_found", message: range.error, retryable: false } };

    const textStyle: Record<string, any> = {};
    const fields: string[] = [];

    if (step.bold != null) { textStyle.bold = step.bold; fields.push("bold"); }
    if (step.italic != null) { textStyle.italic = step.italic; fields.push("italic"); }
    if (step.underline != null) { textStyle.underline = step.underline; fields.push("underline"); }
    if (step.fontSize != null) {
      textStyle.fontSize = { magnitude: step.fontSize, unit: "PT" };
      fields.push("fontSize");
    }
    if (step.fontFamily != null) {
      textStyle.weightedFontFamily = { fontFamily: step.fontFamily };
      fields.push("weightedFontFamily");
    }

    if (fields.length === 0) return { success: true, documentId: step.documentId, note: "No formatting properties specified" };

    await docs.documents.batchUpdate({
      documentId: step.documentId,
      requestBody: {
        requests: [{
          updateTextStyle: {
            textStyle,
            range: { startIndex: range.startIndex, endIndex: range.endIndex },
            fields: fields.join(","),
          },
        }],
      },
    });

    return { success: true, documentId: step.documentId, formatted: fields };
  } catch (err) {
    return { error: classifyDocsError(err) };
  }
}

// ── Format Paragraph ────────────────────────────────────

const HEADING_MAP: Record<number, string> = {
  0: "NORMAL_TEXT",
  1: "HEADING_1",
  2: "HEADING_2",
  3: "HEADING_3",
  4: "HEADING_4",
  5: "HEADING_5",
  6: "HEADING_6",
};

const BULLET_MAP: Record<string, string> = {
  disc: "BULLET_DISC_CIRCLE_SQUARE",
  decimal: "NUMBERED_DECIMAL_ALPHA_ROMAN",
};

async function handleFormatParagraph(step: FormatParagraph, docs: docs_v1.Docs) {
  try {
    const range = await resolveTarget(step.target, step.documentId, docs);
    if ("error" in range) return { error: { code: "invalid", reason: "target_not_found", message: range.error, retryable: false } };

    const requests: docs_v1.Schema$Request[] = [];

    // Paragraph style (heading, alignment)
    const paragraphStyle: Record<string, any> = {};
    const fields: string[] = [];

    if (step.headingLevel != null && HEADING_MAP[step.headingLevel]) {
      paragraphStyle.namedStyleType = HEADING_MAP[step.headingLevel];
      fields.push("namedStyleType");
    }
    if (step.alignment) {
      paragraphStyle.alignment = step.alignment;
      fields.push("alignment");
    }

    if (fields.length > 0) {
      requests.push({
        updateParagraphStyle: {
          paragraphStyle,
          range: { startIndex: range.startIndex, endIndex: range.endIndex },
          fields: fields.join(","),
        },
      });
    }

    // Bullets
    if (step.bulletType && step.bulletType !== "none" && BULLET_MAP[step.bulletType]) {
      requests.push({
        createParagraphBullets: {
          range: { startIndex: range.startIndex, endIndex: range.endIndex },
          bulletPreset: BULLET_MAP[step.bulletType],
        },
      });
    } else if (step.bulletType === "none") {
      requests.push({
        deleteParagraphBullets: {
          range: { startIndex: range.startIndex, endIndex: range.endIndex },
        },
      });
    }

    if (requests.length === 0) return { success: true, documentId: step.documentId, note: "No paragraph formatting specified" };

    await docs.documents.batchUpdate({
      documentId: step.documentId,
      requestBody: { requests },
    });

    return { success: true, documentId: step.documentId };
  } catch (err) {
    return { error: classifyDocsError(err) };
  }
}
