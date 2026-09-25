import type { Nodes, PhrasingContent, Root } from "mdast";
import { parseTimestampCitations, type TimestampCitation } from "@/lib/chat/timestamps";

export type CitationHref = (citation: TimestampCitation) => string | null;

/**
 * A remark plugin that turns bracketed timestamp citations in answer text
 * into links, one per time, carrying the seconds as `data-seconds` for the
 * renderer. `hrefFor` gives each citation's video page; a bracket with any
 * citation it can't place stays as it was written. Text in code and in
 * existing links is left alone.
 */
export function remarkCitations({ hrefFor }: { hrefFor: CitationHref }) {
  return (tree: Root) => {
    linkCitations(tree, hrefFor);
  };
}

function linkCitations(node: Nodes, hrefFor: CitationHref) {
  if (!("children" in node) || node.type === "link" || node.type === "linkReference") return;
  // Text nodes only occur among phrasing content, so the result stays valid.
  (node as { children: Nodes[] }).children = node.children.flatMap((child): Nodes[] => {
    if (child.type !== "text") {
      linkCitations(child, hrefFor);
      return [child];
    }
    return splitText(child.value, hrefFor);
  });
}

function splitText(value: string, hrefFor: CitationHref): PhrasingContent[] {
  const pieces = parseTimestampCitations(value);
  if (pieces.every((piece) => piece.kind === "text")) return [{ type: "text", value }];

  return pieces.flatMap((piece): PhrasingContent[] => {
    if (piece.kind === "text") return [{ type: "text", value: piece.text }];
    const links = piece.citations.map((citation) => ({ citation, href: hrefFor(citation) }));
    if (links.some(({ href }) => href === null)) return [{ type: "text", value: piece.raw }];

    return links.flatMap(({ citation, href }, index): PhrasingContent[] => [
      ...(index > 0 ? [{ type: "text" as const, value: " " }] : []),
      {
        type: "link",
        url: href!,
        children: [{ type: "text", value: citation.label }],
        data: { hProperties: { dataSeconds: citation.seconds } },
      },
    ]);
  });
}
