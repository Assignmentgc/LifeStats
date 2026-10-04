export const MAX_NAME_LENGTH = 50;

type NameSource = { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined;

export function cleanName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH) : "";
}

export function getUserNames(user: NameSource) {
  return {
    firstName: cleanName(user?.user_metadata?.first_name),
    lastName: cleanName(user?.user_metadata?.last_name),
  };
}

// Full name when provided; otherwise a readable name derived from the email.
export function getFullName(user: NameSource): string | null {
  const { firstName, lastName } = getUserNames(user);
  return [firstName, lastName].filter(Boolean).join(" ") || null;
}

export function getDisplayName(user: NameSource): string {
  const fullName = getFullName(user);
  if (fullName) return fullName;
  return (user?.email?.split("@")[0] || "Adventurer")
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Adventurer";
}
