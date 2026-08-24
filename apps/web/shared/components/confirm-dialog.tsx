import { useEffect } from "react";
import { Button } from "./button";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  isDestructive = false,
}: ConfirmDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel, onConfirm]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        className="bg-[#0e0f12] border border-white/[0.08] p-5 rounded-2xl shadow-2xl max-w-sm w-full font-sans animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        {description && (
          <p className="text-sm text-neutral-400 mb-6 font-mono leading-relaxed">{description}</p>
        )}

        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={onCancel} className="flex-1 sm:flex-none">
            {cancelText}
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            className={`flex-1 sm:flex-none ${isDestructive ? "!bg-red-500 !text-white hover:!bg-red-600 focus:!ring-red-500/30" : ""}`}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
