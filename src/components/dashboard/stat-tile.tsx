export function StatTile({
  label,
  value,
  unit,
  delta,
  deltaTone = "faint",
  highlight = false,
}: {
  label: string;
  value: number;
  unit?: string;
  delta?: string;
  deltaTone?: "accent" | "faint" | "destructive";
  highlight?: boolean;
}) {
  const deltaClass =
    deltaTone === "accent"
      ? "text-accent-strong"
      : deltaTone === "destructive"
        ? "text-destructive"
        : "text-ink-faint";

  return (
    <div className="bg-surface border border-border rounded-[14px] px-5 py-4 flex flex-col gap-2">
      <span className="text-xs text-ink-faint">{label}</span>
      <span className={`mono text-[26px] font-bold ${highlight ? "text-accent-strong" : "text-ink"}`}>
        {value}
        {unit && <span className="text-sm text-ink-faint font-normal ml-0.5">{unit}</span>}
      </span>
      {/* Always render this line (even with no delta) so toggling "前期間と比較"
          doesn't change the tile's height — an invisible placeholder reserves
          the same space a real delta would take. */}
      <span className={`text-[11px] ${delta ? deltaClass : "invisible"}`}>{delta ?? "placeholder"}</span>
    </div>
  );
}
