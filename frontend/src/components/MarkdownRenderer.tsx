import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="w-full break-words">
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={{
          table: ({ node, ...props }) => (
            <div className="w-full overflow-x-auto my-6 neo-card p-4">
              <table className="w-full text-left border-collapse" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="p-3 border-b border-[var(--border-subtle)] text-[var(--text-primary)] font-semibold" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="p-3 border-b border-[var(--border-subtle)]/50 text-[var(--text-secondary)]" {...props} />
          ),
          h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-6 mb-4 text-[var(--text-primary)]" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-xl font-bold mt-5 mb-3 text-[var(--text-primary)]" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-lg font-semibold mt-4 mb-2 text-[var(--text-primary)]" {...props} />,
          p: ({ node, ...props }) => <p className="leading-relaxed text-[var(--text-secondary)] mb-4" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-6 mb-4 text-[var(--text-secondary)] space-y-2" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-6 mb-4 text-[var(--text-secondary)] space-y-2" {...props} />,
          li: ({ node, ...props }) => <li className="pl-1" {...props} />,
          pre: ({ node, ...props }) => (
            <pre className="neo-card p-4 overflow-x-auto my-4 text-[0.875em]" {...props} />
          ),
          code: ({ node, className, ...props }) => {
            const isInline = !className?.includes('language-');
            return isInline ? (
              <code className="bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded text-[0.875em] text-[var(--accent-primary)] font-mono" {...props} />
            ) : (
              <code className={className + " font-mono text-[var(--text-primary)]"} {...props} />
            );
          },
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-[var(--accent-primary)] pl-4 italic text-[var(--text-secondary)] my-4" {...props} />
          ),
          a: ({ node, ...props }) => (
            <a className="text-[var(--accent-primary)] hover:underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
