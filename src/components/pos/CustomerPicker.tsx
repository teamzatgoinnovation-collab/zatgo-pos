import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Search } from "@zatgo/icons";
import { cn } from "@zatgo/ui";
import type { CustomerRecord } from "@/lib/pos-repo";
import { posRepo } from "@/lib/pos-repo";
import { SEARCH_LIMIT, customersKey, normalizeQuery } from "@/lib/customer-search";
import { useDebouncedValue } from "@/lib/use-debounced-value";

/**
 * Pick the customer of a sale by searching the whole customer list (name or phone), not just the first page the Sell page
 * loads. Offline it searches the copy saved on this device. `null` is the walk-in / typed-in customer.
 */
export function CustomerPicker({
  selectedId,
  selectedName,
  selectedPhone,
  offline,
  triggerClassName,
  onPick,
}: {
  selectedId: string | null;
  selectedName: string;
  selectedPhone: string;
  offline: boolean;
  triggerClassName?: string;
  onPick: (customer: CustomerRecord | null) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const typed = normalizeQuery(text);
  const query = useDebouncedValue(typed, 250);

  const { data: rows = [], isFetching, isError } = useQuery({
    queryKey: customersKey(query),
    queryFn: () => posRepo.listCustomers(query || undefined),
    enabled: open,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const walkIn = offline ? "Walk-in" : "Walk-in / custom";
  const label = selectedId ? `${selectedName}${selectedPhone ? ` · ${selectedPhone}` : ""}` : walkIn;
  // Index 0 is the walk-in row, the customers follow.
  const options: (CustomerRecord | null)[] = [null, ...rows];
  const searching = isFetching || typed !== query;

  // The first match is ready for Enter as soon as there is one.
  useEffect(() => {
    setActive(query && rows.length > 0 ? 1 : 0);
  }, [query, rows]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, listId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (customer: CustomerRecord | null) => {
    onPick(customer);
    setOpen(false);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      // Stay inside the picker: Enter must not submit the invoice dialog behind it.
      e.preventDefault();
      if (active < options.length) choose(options[active] ?? null);
    }
  };

  return (
    <div ref={rootRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setText("");
        }}
        className={cn("flex items-center justify-between gap-2 text-left", triggerClassName)}
      >
        <span className={cn("truncate", !selectedId && "text-[var(--color-muted-foreground)]")}>{label}</span>
        <ChevronDown className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
      </button>
      {open ? (
        <div className="mt-1 rounded-[var(--radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3">
            <Search className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
            <input
              autoFocus
              role="combobox"
              aria-label="Search customers"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={`${listId}-${active}`}
              autoComplete="off"
              placeholder={offline ? "Search saved customers by name or phone…" : "Search by name or phone…"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-foreground)]"
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Customers" className="max-h-52 overflow-auto p-1">
            {options.map((opt, i) => {
              const chosen = opt ? opt.id === selectedId : !selectedId;
              return (
                <li
                  key={opt ? opt.id : "walk-in"}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={chosen}
                  data-active={i === active}
                  onMouseEnter={() => setActive(i)}
                  // Keep the focus in the search box so the click does not blur it first.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(opt)}
                  className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-sm data-[active=true]:bg-[var(--color-accent)] data-[active=true]:text-[var(--color-accent-foreground)]"
                >
                  <Check className={cn("size-4 shrink-0", chosen ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">{opt ? opt.name : walkIn}</span>
                  {opt?.phone ? <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">{opt.phone}</span> : null}
                </li>
              );
            })}
          </ul>
          <p role="status" className="px-3 pb-2 text-xs text-[var(--color-muted-foreground)] empty:hidden">
            {isError
              ? "Could not search customers. Check the connection and try again."
              : searching
                ? "Searching…"
                : rows.length === 0
                  ? query
                    ? `No customer matches “${query}”.`
                    : "No saved customers yet."
                  : rows.length >= SEARCH_LIMIT
                    ? `Showing the first ${SEARCH_LIMIT} — type more to narrow the list.`
                    : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
