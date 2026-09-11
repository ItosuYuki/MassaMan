import Image from "next/image";

export function LogoBadge({ size = 40 }: { size?: number }) {
  return (
    <div
      className="shrink-0 overflow-hidden rounded-xl"
      style={{ width: size, height: size }}
    >
      <Image src="/icon.png" alt="マッサマン" width={size} height={size} className="h-full w-full object-cover" />
    </div>
  );
}
