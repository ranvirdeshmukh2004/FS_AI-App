import { Bot } from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";

interface Props {
  content: string;
}

export function StreamingBubble({ content }: Props) {
  return (
    <div className="flex gap-3 justify-start">
      <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center flex-shrink-0">
        <Bot size={16} className="text-primary-600 dark:text-primary-400" />
      </div>
      <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-gray-100 dark:bg-gray-800">
        <MarkdownContent content={content} streaming />
      </div>
    </div>
  );
}
