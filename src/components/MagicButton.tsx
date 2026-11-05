import type { ComponentProps } from "react";

/** The gilded menu button. Pass "primary", "ghost" or "small" in className for its variants. */
export default function MagicButton({
  className,
  children,
  ...buttonProps
}: ComponentProps<"button">) {
  return (
    <button className={className ? `btn ${className}` : "btn"} {...buttonProps}>
      <span className="shine" />
      {children}
    </button>
  );
}
