import { BrandMark } from "@/components/brand-mark";

export default function Loading() {
  return (
    <main className="route-loading" role="status" aria-label="Loading LifeStats">
      <BrandMark className="route-loading__mark" />
      <p className="route-loading__message">
        <strong>LifeStats</strong>
        <span>Loading your space...</span>
      </p>
    </main>
  );
}
