import { useEffect, useRef } from "react";
import "emoji-picker-element";

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  onClose: () => void;
}

interface EmojiClickEvent extends Event {
  detail: {
    unicode: string;
    emoji: {
      unicode: string;
    };
  };
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "emoji-picker": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}

function EmojiPicker({ onEmojiSelect, onClose }: EmojiPickerProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLElement | null>(null);

  useEffect((): (() => void) => {
    const picker: HTMLElement | null = pickerRef.current;

    const handleEmojiClick = (event: Event): void => {
      const emojiEvent: EmojiClickEvent = event as EmojiClickEvent;
      const emoji: string = emojiEvent.detail.unicode;
      onEmojiSelect(emoji);
    };

    if (picker) {
      picker.addEventListener("emoji-click", handleEmojiClick);
    }

    const handleClickOutside = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return (): void => {
      if (picker) {
        picker.removeEventListener("emoji-click", handleEmojiClick);
      }
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onEmojiSelect, onClose]);

  return (
    <div ref={containerRef} className="emoji-picker-container">
      <emoji-picker ref={pickerRef as React.RefObject<HTMLElement>} />
    </div>
  );
}

export default EmojiPicker;
