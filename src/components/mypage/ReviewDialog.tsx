"use client";

import { useState } from "react";
import { Modal } from "@/components/booking/Modal";

export function ReviewDialog(props: {
  therapistName: string;
  pending: boolean;
  error: string | null;
  onSubmit: (rating: number, comment: string) => void;
  onClose: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");

  const displayRating = hoverRating || rating;

  return (
    <Modal onClose={props.onClose}>
      <p className="mb-1 text-xs text-ink-faint">レビューを書く</p>
      <p className="mb-4 text-sm font-medium text-ink">{props.therapistName} さんの施術</p>

      <div className="mb-4 flex justify-center gap-1.5" onMouseLeave={() => setHoverRating(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHoverRating(n)}
            aria-label={`${n}`}
            className="text-3xl leading-none text-star"
          >
            {n <= displayRating ? "★" : "☆"}
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="コメント（任意）"
        rows={3}
        className="mb-4 w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm text-ink placeholder:text-ink-faint"
      />

      {props.error && <p className="mb-3 text-xs text-destructive">{props.error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => props.onSubmit(rating, comment)}
          disabled={props.pending || rating === 0}
          className="h-11 flex-1 rounded-xl bg-accent text-sm font-medium text-white disabled:opacity-40"
        >
          {props.pending ? "送信中…" : "投稿する"}
        </button>
        <button
          onClick={props.onClose}
          className="h-11 flex-1 rounded-xl border border-border text-sm text-ink-soft"
        >
          キャンセル
        </button>
      </div>
    </Modal>
  );
}
