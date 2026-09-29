export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";

  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function posterStatusColor(status: string) {
  if (status === "published") return "success" as const;
  if (status === "downloaded") return "info" as const;

  return "neutral" as const;
}

export function extractionStatusColor(status: string | null | undefined) {
  if (status === "completed") return "success" as const;
  if (status === "failed") return "error" as const;
  if (status === "processing") return "info" as const;

  return "warning" as const;
}
