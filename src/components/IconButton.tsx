import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, children, ...props }: IconButtonProps) {
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
