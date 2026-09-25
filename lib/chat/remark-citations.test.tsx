import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { remarkCitations, type CitationHref } from "./remark-citations";

const toVideo: CitationHref = (citation) =>
  citation.source === undefined ? `/videos/dQw4w9WgXcQ?t=${citation.seconds}` : null;

// Renders links plainly, showing what the chat's link component would get.
function render(text: string, hrefFor: CitationHref = toVideo) {
  return renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={[remarkGfm, [remarkCitations, { hrefFor }]]}
      components={{
        a: ({ href, children, ...props }) => {
          const seconds = (props as Record<string, unknown>)["data-seconds"];
          return (
            <a href={href} data-seconds={typeof seconds === "number" ? seconds : "missing"}>
              {children}
            </a>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>,
  );
}

describe("remarkCitations", () => {
  it("links a citation and passes its seconds as a number", () => {
    expect(render("Yeast eats sugar [0:42].")).toBe(
      '<p>Yeast eats sugar <a href="/videos/dQw4w9WgXcQ?t=42" data-seconds="42">0:42</a>.</p>',
    );
  });

  it("links each time in a list, and ranges by their start", () => {
    expect(render("See [0:42, 1:10–1:30].")).toBe(
      '<p>See <a href="/videos/dQw4w9WgXcQ?t=42" data-seconds="42">0:42</a> <a href="/videos/dQw4w9WgXcQ?t=70" data-seconds="70">1:10–1:30</a>.</p>',
    );
  });

  it("links citations inside emphasis and list items", () => {
    expect(render("- **Rise** [1:05]")).toContain(
      '<strong>Rise</strong> <a href="/videos/dQw4w9WgXcQ?t=65" data-seconds="65">1:05</a>',
    );
  });

  it("leaves code, existing links and bare times alone", () => {
    const html = render("Use `[0:42]` or [the clip](https://example.com/[0:42]) at 10:30.");
    expect(html).toContain("<code>[0:42]</code>");
    expect(html).toContain('<a href="https://example.com/%5B0:42%5D" data-seconds="missing">the clip</a>');
    expect(html).toContain("at 10:30.");
  });

  it("keeps a bracket it can't place as written", () => {
    expect(render("Both say so [2 @ 1:05].")).toBe("<p>Both say so [2 @ 1:05].</p>");
  });
});
