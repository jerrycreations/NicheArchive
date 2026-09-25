/**
 * Saves `blob` as a download named `filename`, through a temporary object URL
 * and a link the user never sees.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked a moment later: some browsers start the download after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * The filename in a Content-Disposition header: the UTF-8 `filename*` when
 * there is one, else the plain `filename`. Null when there's neither.
 */
export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // Malformed percent-encoding: fall back to the plain name.
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i.exec(header);
  const name = (plain?.[1] ?? plain?.[2])?.trim();
  return name || null;
}
