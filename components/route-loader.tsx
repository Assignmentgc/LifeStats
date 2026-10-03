import { BrandMark } from "@/components/brand-mark";

type RouteLoaderProps = {
  message?: string;
  overlay?: boolean;
};

export function RouteLoader({ message = "Loading your space...", overlay = false }: RouteLoaderProps) {
  const Container = overlay ? "div" : "main";
  return (
    <Container className={overlay ? "route-loading route-loading--overlay" : "route-loading"} role="status" aria-label="Loading LifeStats">
      <BrandMark className="route-loading__mark" />
      <p className="route-loading__message">
        <strong>LifeStats</strong>
        <span>{message}</span>
      </p>
    </Container>
  );
}
