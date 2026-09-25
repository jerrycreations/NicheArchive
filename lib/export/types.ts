/** One transcript file for "Download all", named and formatted by the server. */
export type ExportFile = { name: string; content: string };

/**
 * What GET /api/export answers: every ready transcript, with unique names,
 * and how many videos were left out because their transcript isn't ready.
 */
export type ExportBundle = { files: ExportFile[]; skipped: number };
