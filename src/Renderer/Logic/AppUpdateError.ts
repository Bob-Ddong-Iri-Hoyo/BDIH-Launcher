export type AppUpdateFailureReason = "connectionRefused" | "network" | "unknown";

export interface AppUpdateFailure {
  reason: AppUpdateFailureReason;
  details: string;
  code?: string;
}

function describe_app_update_error(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

function extract_app_update_error_code(details: string): string | undefined {
  return details.match(/net::ERR_[A-Z0-9_]+/i)?.[0]
    ?? details.match(/\bERR_[A-Z0-9_]+\b/i)?.[0]
    ?? details.match(/\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)\b/i)?.[0];
}

/** Classifies updater failures while preserving the original diagnostic text. */
export function classify_app_update_failure(error: unknown): AppUpdateFailure {
  const details = describe_app_update_error(error).trim();
  const normalized = details.toLowerCase();
  let reason: AppUpdateFailureReason = "unknown";

  if (/err_connection_refused|econnrefused|connection refused/.test(normalized)) {
    reason = "connectionRefused";
  } else if (/err_(?:internet_disconnected|network_changed|name_not_resolved|connection_(?:reset|closed|timed_out)|timed_out|address_unreachable|proxy_connection_failed)|enotfound|eai_again|econnreset|etimedout|network|fetch failed|socket hang up/.test(normalized)) {
    reason = "network";
  }

  return {
    reason,
    details,
    code: extract_app_update_error_code(details),
  };
}
