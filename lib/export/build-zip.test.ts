import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { buildZip, EXPORT_FOLDER, EXPORT_ZIP_NAME } from "./build-zip";

describe("buildZip", () => {
  it("puts every file in one folder, unchanged", async () => {
    const blob = await buildZip([
      { name: "How Bread Rises.txt", content: "Title: How Bread Rises\n\nYeast.\n" },
      { name: "How Bread Rises (2).txt", content: "Second.\n" },
    ]);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => entry.name)
      .sort();
    expect(names).toEqual([
      `${EXPORT_FOLDER}/How Bread Rises (2).txt`,
      `${EXPORT_FOLDER}/How Bread Rises.txt`,
    ]);
    await expect(zip.file(`${EXPORT_FOLDER}/How Bread Rises.txt`)?.async("string")).resolves.toBe(
      "Title: How Bread Rises\n\nYeast.\n",
    );
  });

  it("keeps names in any script", async () => {
    const name = `${String.fromCodePoint(0x65e5, 0x672c)} ${String.fromCodePoint(0x1f600)}.txt`;
    const blob = await buildZip([{ name, content: "text\n" }]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file(`${EXPORT_FOLDER}/${name}`)).not.toBeNull();
  });

  it("reports progress up to 100", async () => {
    const onProgress = vi.fn();
    await buildZip([{ name: "a.txt", content: "a\n" }], onProgress);
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it("names the download after the folder", () => {
    expect(EXPORT_ZIP_NAME).toBe("NicheArchive Transcripts.zip");
  });
});
