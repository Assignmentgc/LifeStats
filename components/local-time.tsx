"use client";

import { useSyncExternalStore } from "react";
import { formatDateTime } from "@/lib/utils";

const subscribe = () => () => {};

// The server cannot know the visitor's timezone, so it renders UTC and the
// browser swaps in local time after hydration without a mismatch.
export function LocalTime({ value }: { value: string }) {
  const label = useSyncExternalStore(
    subscribe,
    () => formatDateTime(value),
    () => formatDateTime(value, "UTC"),
  );
  return <time dateTime={value}>{label}</time>;
}
