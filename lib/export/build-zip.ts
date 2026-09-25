import type { ExportFile } from "@/lib/export/types";

/** The folder the ZIP unzips to, and the ZIP's own name. */
export const EXPORT_FOLDER = "NicheArchive Transcripts";

export const EXPORT_ZIP_NAME = `${EXPORT_FOLDER}.zip`;

/**
 * Zips the transcripts into one folder, reporting progress from 0 to 100.
 * JSZip is loaded only now, so the library page doesn't carry it.
 */
export async function buildZip(
  files: readonly ExportFile[],
  onProgress?: (percent: number) => void,
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const folder = zip.folder(EXPORT_FOLDER);
  if (!folder) throw new Error(`Couldn't create the ${EXPORT_FOLDER} folder in the ZIP.`);
  for (const file of files) folder.file(file.name, file.content);

  return zip.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      mimeType: "application/zip",
    },
    (metadata) => onProgress?.(metadata.percent),
  );
}
