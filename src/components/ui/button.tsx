import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 focus-visible:outline-none",
  {
    variants: {
      variant: {
        default: "bg-role-admin text-white hover:bg-accent-strong",
        outline: "border border-border bg-surface-2 text-ink-soft hover:bg-surface",
        ghost: "text-ink-faint hover:text-ink hover:bg-surface-2",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-7 px-2.5 text-[11px] rounded-lg",
        icon: "h-8 w-8 shrink-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
