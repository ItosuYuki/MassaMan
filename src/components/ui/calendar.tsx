"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ja } from "react-day-picker/locale";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

function Calendar({
  className,
  classNames,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={ja}
      showOutsideDays
      className={cn("mono p-0", className)}
      classNames={{
        months: "flex flex-col gap-2",
        month: "flex flex-col gap-2",
        month_caption: "flex items-center justify-center h-8 text-xs text-ink",
        caption_label: "font-medium",
        nav: "flex items-center justify-between absolute inset-x-0 top-0 h-8",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-7 w-7 p-1"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-7 w-7 p-1"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-ink-faint w-8 text-[10px] font-normal text-center",
        week: "flex w-full mt-1",
        day: "text-center p-0 relative",
        day_button: cn(
          "w-8 h-8 rounded-full text-[11px] text-ink-soft hover:bg-surface-2 transition-colors"
        ),
        selected: "[&>button]:bg-role-admin [&>button]:text-white [&>button]:hover:bg-role-admin",
        today: "[&>button]:text-accent [&>button]:font-medium",
        outside: "[&>button]:text-ink-faint/50",
        disabled: "[&>button]:text-ink-faint/30 [&>button]:pointer-events-none",
        hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}

export { Calendar };
