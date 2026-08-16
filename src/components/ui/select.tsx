import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Select({
  value,
  onValueChange,
  items,
  placeholder,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  items: Array<{ value: string; label: string }>;
  placeholder?: string;
  className?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        className={cn(
          "inline-flex h-10 min-w-36 items-center justify-between gap-2 rounded-sm border border-border-strong bg-surface px-3 text-sm",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <ChevronDown className="size-3.5 text-muted" />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md bg-surface p-1 shadow-[var(--shadow-border)]"
        >
          <SelectPrimitive.Viewport>
            {items.map((it) => (
              <SelectPrimitive.Item
                key={it.value}
                value={it.value}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-2 text-sm outline-none data-highlighted:bg-sunken"
              >
                <SelectPrimitive.ItemText>{it.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="size-3.5" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
