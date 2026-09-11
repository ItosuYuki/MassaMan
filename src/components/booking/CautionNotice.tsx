const NOTES = [
  "キャンセル・変更はお早めにお願いします。",
  "予約時間に遅れる場合は、事前にご連絡ください。",
  "予約時間に遅れた場合、施術時間が短くなる場合があります。",
  "施術を受けやすいよう、薄手で脱ぎ着しやすい服装でお越しください。",
  "厚手の服や動きにくい服装の場合、施術がしづらくなることがあります。",
  "体調がすぐれない場合は、無理をせず予約のキャンセル・変更をお願いします。",
  "予約時間には余裕をもってお越しください。",
];

export function CautionNotice() {
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5 text-xs leading-relaxed text-ink-soft">
      <p className="mb-1.5 font-bold text-ink">注意事項</p>
      <ul className="flex flex-col gap-1">
        {NOTES.map((note) => (
          <li key={note} className="flex gap-1.5">
            <span aria-hidden>・</span>
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
