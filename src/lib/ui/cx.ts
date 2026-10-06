/** Joins class names, skipping falsy parts. Plain module: safe in server and client components. */
export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");
