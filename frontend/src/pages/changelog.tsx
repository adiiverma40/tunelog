import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkAlert } from "remark-github-blockquote-alert";
import { Modal } from "../components/ui/modal";
import { useWhatsNew } from "../hooks/useWhatsNew";

export const WhatsNewModal = () => {
  const { isOpen, entries, dismiss } = useWhatsNew();

  if (entries.length === 0) return null;

  return (
    <Modal isOpen={isOpen} onClose={dismiss} className="max-w-[760px] p-6 lg:p-8">
      <div className="max-h-[60vh] space-y-6 overflow-y-auto pr-1">
        {entries.map((entry) => (
          <div key={entry.version}>
            <div className="mb-2 text-xs text-gray-400">
              v{entry.version} · {entry.date}
            </div>
            <div className="prose dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkAlert]}>
                {entry.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={dismiss}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          Got it
        </button>
      </div>
    </Modal>
  );
};