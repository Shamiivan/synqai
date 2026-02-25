// Typed artifact envelope — gives every cross-domain reference an unambiguous identity.
// A ref like "drive:file:1XllL" can never be confused with "gmail:message:1XllL".

export type ArtifactKind =
  | "drive_file"
  | "gmail_draft"
  | "gmail_message"
  | "calendar_event"
  | "doc"
  | "sheet"
  | "meet_space"
  | "meet_transcript";

export type ArtifactDomain =
  | "drive"
  | "gmail"
  | "calendar"
  | "docs"
  | "sheets"
  | "meet";

export interface Artifact {
  ref: string; // "drive:file:1XllL..." — globally unique
  kind: ArtifactKind;
  domain: ArtifactDomain;
  id: string; // native ID for the domain API
  label?: string; // human-readable (filename, subject, event title)
  data?: Record<string, unknown>; // optional extra metadata
}
