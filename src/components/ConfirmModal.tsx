"use client";

import { X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "primary";
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({
  isOpen, title, message, confirmLabel = "Confirm",
  confirmVariant = "danger", onConfirm, onClose,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="modal-body">
          <p className="text-sm text-text-secondary">{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className={`btn ${confirmVariant === "danger" ? "btn-danger" : "btn-primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
