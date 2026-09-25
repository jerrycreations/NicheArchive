"use client";

import ReactMarkdown, { type Components, type ExtraProps, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { TimestampLink } from "@/components/chat/timestamp-link";
import { remarkCitations, type CitationHref } from "@/lib/chat/remark-citations";

/** Props for the DOM: react-markdown also hands each component its syntax-tree node. */
function withoutNode<P extends ExtraProps>(props: P): Omit<P, "node"> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

// Answers get compact prose styles: the chat column is narrow, and headings
// in a reply shouldn't shout.
const COMPONENTS: Components = {
  p: (props) => <p className="my-2 first:mt-0 last:mb-0" {...withoutNode(props)} />,
  ul: (props) => <ul className="my-2 list-disc space-y-1 pl-5" {...withoutNode(props)} />,
  ol: (props) => <ol className="my-2 list-decimal space-y-1 pl-5" {...withoutNode(props)} />,
  li: (props) => <li className="pl-0.5" {...withoutNode(props)} />,
  h1: (props) => <h3 className="mt-4 mb-2 font-semibold first:mt-0" {...withoutNode(props)} />,
  h2: (props) => <h3 className="mt-4 mb-2 font-semibold first:mt-0" {...withoutNode(props)} />,
  h3: (props) => <h3 className="mt-3 mb-1.5 font-semibold first:mt-0" {...withoutNode(props)} />,
  h4: (props) => <h4 className="mt-3 mb-1.5 font-medium first:mt-0" {...withoutNode(props)} />,
  blockquote: (props) => (
    <blockquote className="my-2 border-l-2 pl-3 text-muted-foreground" {...withoutNode(props)} />
  ),
  code: ({ className, ...props }) => (
    <code
      className={className ?? "rounded-sm bg-muted px-1 py-px font-mono text-[0.8125rem]"}
      {...withoutNode(props)}
    />
  ),
  pre: (props) => (
    <pre
      className="my-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[0.8125rem]"
      {...withoutNode(props)}
    />
  ),
  hr: () => <hr className="my-3" />,
  table: (props) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-left" {...withoutNode(props)} />
    </div>
  ),
  th: (props) => <th className="border-b px-2 py-1 font-medium" {...withoutNode(props)} />,
  td: (props) => <td className="border-b px-2 py-1 align-top" {...withoutNode(props)} />,
  a: ({ href, children, ...props }) => {
    // Citations from remarkCitations carry their time.
    const seconds = (props as Record<string, unknown>)["data-seconds"];
    if (typeof seconds === "number" && href) {
      return (
        <TimestampLink seconds={seconds} href={href}>
          {children}
        </TimestampLink>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline underline-offset-4"
      >
        {children}
      </a>
    );
  },
};

/**
 * An answer's Markdown, with GitHub-style tables and lists. Raw HTML isn't
 * rendered. With `citationHref`, bracketed timestamps become links that play
 * or open the video at that moment.
 */
export function Markdown({ text, citationHref }: { text: string; citationHref?: CitationHref }) {
  const remarkPlugins: Options["remarkPlugins"] = citationHref
    ? [remarkGfm, [remarkCitations, { hrefFor: citationHref }]]
    : [remarkGfm];

  return (
    <div className="break-words">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
