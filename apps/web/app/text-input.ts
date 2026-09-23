const caseSensitiveInputTypes = new Set([
  "email",
  "password",
  "file",
  "number",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
  "range",
  "color",
  "checkbox",
  "radio",
  "hidden",
]);

export function shouldUppercaseApplicationInput(
  tagName: string,
  type = "text",
  keepCase = false,
): boolean {
  if (keepCase) return false;
  if (tagName.toUpperCase() === "TEXTAREA") return true;
  return (
    tagName.toUpperCase() === "INPUT" &&
    !caseSensitiveInputTypes.has(type.toLowerCase())
  );
}
