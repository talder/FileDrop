"use client";

import { useRef, type ReactNode, type CSSProperties } from "react";

interface ModalOverlayProps {
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Backdrop wrapper for modals.
 *
 * Dismisses only when BOTH the mousedown and mouseup happen on the overlay
 * backdrop itself. This prevents the modal from closing when the user starts a
 * text selection (or any drag) inside a form field and releases the mouse
 * button outside the modal box.
 */
export default function ModalOverlay({ onClose, children, maxWidth, className, style }: ModalOverlayProps) {
  const pressedOnOverlay = useRef(false);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { pressedOnOverlay.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => {
        if (pressedOnOverlay.current && e.target === e.currentTarget) onClose();
        pressedOnOverlay.current = false;
      }}
    >
      <div className={`modal${className ? ` ${className}` : ""}`} style={{ ...(maxWidth ? { maxWidth } : {}), ...style }}>
        {children}
      </div>
    </div>
  );
}
