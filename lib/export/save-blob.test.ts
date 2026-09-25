import { afterEach, describe, expect, it, vi } from "vitest";
import { contentDisposition } from "./filenames";
import { filenameFromContentDisposition, saveBlob } from "./save-blob";

describe("filenameFromContentDisposition", () => {
  it("reads back what contentDisposition wrote", () => {
    const name = `${String.fromCodePoint(0x65e5, 0x672c)} It's (live).txt`;
    expect(filenameFromContentDisposition(contentDisposition(name))).toBe(name);
  });

  it("falls back to the plain filename", () => {
    expect(filenameFromContentDisposition('attachment; filename="Bread.txt"')).toBe("Bread.txt");
    expect(filenameFromContentDisposition("attachment; filename=Bread.txt")).toBe("Bread.txt");
  });

  it("uses the plain filename when filename* is malformed", () => {
    expect(
      filenameFromContentDisposition(`attachment; filename="Bread.txt"; filename*=UTF-8''%E6%97`),
    ).toBe("Bread.txt");
  });

  it("is null without a filename", () => {
    expect(filenameFromContentDisposition(null)).toBeNull();
    expect(filenameFromContentDisposition("attachment")).toBeNull();
  });
});

describe("saveBlob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("clicks a download link for the blob, then revokes its URL", () => {
    vi.useFakeTimers();
    const link = { click: vi.fn(), remove: vi.fn() } as unknown as HTMLAnchorElement;
    const append = vi.fn();
    vi.stubGlobal("document", { createElement: () => link, body: { append } });
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:zip");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const blob = new Blob(["zip"]);
    saveBlob(blob, "NicheArchive Transcripts.zip");

    expect(create).toHaveBeenCalledWith(blob);
    expect(link).toMatchObject({ href: "blob:zip", download: "NicheArchive Transcripts.zip" });
    expect(append).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalled();
    expect(link.remove).toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:zip");
  });
});
