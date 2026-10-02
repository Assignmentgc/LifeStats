export const TODO_CATEGORIES = [
  { value: "urgent_important", label: "Important & urgent", description: "Do these first" },
  { value: "important", label: "Important", description: "Schedule focused time" },
  { value: "not_important_not_urgent", label: "Not important & not urgent", description: "Consider later" },
] as const;

export type TodoCategory = (typeof TODO_CATEGORIES)[number]["value"];

export function isTodoCategory(value: string): value is TodoCategory {
  return TODO_CATEGORIES.some((category) => category.value === value);
}
