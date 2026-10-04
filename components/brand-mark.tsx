type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19.2 6.8A17.2 17.2 0 0 0 8.4 13.2" stroke="#10C98B" strokeLinecap="round" strokeWidth="5.5" />
      <path d="M28.8 6.8A17.2 17.2 0 0 1 39.6 13.2" stroke="#FF645F" strokeLinecap="round" strokeWidth="5.5" />
      <path d="M41.2 20A17.2 17.2 0 0 1 41.2 28" stroke="#168EF0" strokeLinecap="round" strokeWidth="5.5" />
      <path d="M38.6 35.5A17.2 17.2 0 0 1 28 41" stroke="#FFAE25" strokeLinecap="round" strokeWidth="5.5" />
      <path d="M20 41.2A17.2 17.2 0 0 1 9.2 35.5" stroke="#F22F9A" strokeLinecap="round" strokeWidth="5.5" />
      <path d="M6.8 28A17.2 17.2 0 0 1 6.8 20" stroke="#8A45F5" strokeLinecap="round" strokeWidth="5.5" />
      <circle cx="24" cy="24" r="3.7" fill="#F8FAFC" />
    </svg>
  );
}
