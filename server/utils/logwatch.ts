type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LogContext {
  action: string;
  message: string;
  userId?: string;
  [key: string]: unknown;
}

interface LogPayload {
  level: LogLevel;
  message: string;
  raw?: string;
  type: "text" | "json";
}

/**
 * Server logging using logwatch
 *
 * Every entry is written to the console. When NUXT_LOGWATCH_URL is set the
 * entry is also posted to that Logwatch channel.
 */
class Logwatch {
  private _format(message: unknown): string {
    return typeof message === "object"
      ? JSON.stringify(message, null, 2)
      : String(message);
  }

  private _send(level: LogLevel, message: unknown): void {
    // Read per call rather than at import time, before runtime config exists.
    const endpoint = useRuntimeConfig().logwatchUrl;

    if (!endpoint) {
      return;
    }

    const isObject = typeof message === "object" && message !== null;
    let payload: LogPayload;

    if (isObject && "message" in (message as object)) {
      payload = {
        level,
        message: String((message as LogContext).message),
        raw: JSON.stringify(message),
        type: "json",
      };
    } else {
      payload = {
        level,
        message: isObject ? JSON.stringify(message) : String(message),
        type: isObject ? "json" : "text",
      };
    }

    // A Logwatch outage can never fail the request that
    // produced the entry.
    fetch(endpoint, {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).catch((error) => console.error("Logwatch send failed:", error));
  }

  trace(message: unknown): void {
    console.debug(this._format(message));
    this._send("trace", message);
  }

  debug(message: unknown): void {
    console.debug(this._format(message));
    this._send("debug", message);
  }

  info(message: unknown): void {
    console.info(this._format(message));
    this._send("info", message);
  }

  success(message: unknown): void {
    console.info(this._format(message));
    this._send("info", message);
  }

  warn(message: unknown): void {
    console.warn(this._format(message));
    this._send("warn", message);
  }

  error(message: unknown): void {
    console.error(this._format(message));
    this._send("error", message);
  }

  critical(message: unknown): void {
    console.error(this._format(message));
    this._send("fatal", message);
  }
}

export const logwatch = new Logwatch();
