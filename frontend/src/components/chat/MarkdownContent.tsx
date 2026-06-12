import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface Props {
  content: string;
  streaming?: boolean;
}

export function MarkdownContent({ content, streaming = false }: Props) {
  return (
    <div className="max-w-none text-sm leading-7 text-gray-900 dark:text-gray-100">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1({ children }) {
            return (
              <h1 className="mb-3 mt-4 border-b border-gray-300 pb-2 text-xl font-bold leading-tight dark:border-gray-600">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className="mb-2 mt-4 border-b border-gray-200 pb-1.5 text-lg font-semibold leading-tight dark:border-gray-700">
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return <h3 className="mb-2 mt-3 text-base font-semibold leading-tight">{children}</h3>;
          },
          h4({ children }) {
            return <h4 className="mb-1.5 mt-3 text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">{children}</h4>;
          },
          p({ children }) {
            return <p className="my-2 whitespace-pre-wrap">{children}</p>;
          },
          hr() {
            return <hr className="my-4 border-gray-300 dark:border-gray-600" />;
          },
          ul({ children }) {
            return <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>;
          },
          li({ children }) {
            return <li className="pl-1 marker:text-gray-400">{children}</li>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="my-3 border-l-4 border-primary-400 bg-white/60 py-2 pl-3 pr-2 text-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
                {children}
              </blockquote>
            );
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary-600 underline decoration-primary-300 underline-offset-2 hover:text-primary-700 dark:text-primary-400"
              >
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="min-w-full border-collapse text-left text-sm">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-gray-200/70 dark:bg-gray-700/70">{children}</thead>;
          },
          th({ children }) {
            return <th className="border-b border-gray-200 px-3 py-2 font-semibold dark:border-gray-700">{children}</th>;
          },
          td({ children }) {
            return <td className="border-t border-gray-200 px-3 py-2 align-top dark:border-gray-700">{children}</td>;
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const codeString = String(children).replace(/\n$/, "");
            if (match) {
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  className="!my-3 rounded-lg text-sm"
                >
                  {codeString}
                </SyntaxHighlighter>
              );
            }
            return (
              <code
                className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-[0.9em] text-gray-900 dark:bg-gray-700 dark:text-gray-100"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
      {streaming && <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-primary-500 align-text-bottom" />}
    </div>
  );
}
