import { StarIcon } from "@/components/common";

/** Star row rendered only when a review exists; rating is 1–5 (ui-spec 5). */
export function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} trên 5 sao`}>
      {Array.from({ length: 5 }, (_, index) => (
        <StarIcon
          key={index}
          size={16}
          className={index < rating ? "text-accent" : "text-line"}
        />
      ))}
    </span>
  );
}
