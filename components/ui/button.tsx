import type { ButtonHTMLAttributes } from "react";

import { cn } from "./utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export function Button({
  className,
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  type,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn("button", `button--${variant}`, size !== "md" && `button--${size}`, className)}
      disabled={disabled || loading}
      type={type ?? "button"}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? "Saving…" : children}
    </button>
  );
}
