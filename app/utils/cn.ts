import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins conditional class values and resolves conflicting Tailwind utilities so
 * that a caller's class wins over a component's default.
 */
export default function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
