// Figshare sends the user back here after Sign in with Figshare. The code is
// traded for a token, which is stored encrypted (server/utils/figshare.ts).
import { timingSafeEqual } from "node:crypto";

const STATE_COOKIE = "figshare_oauth_state";

function sameValue(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = session.user.id;
  const {
    code,
    state,
    error,
    error_description: errorDescription,
  } = getQuery(event);
  const expectedNonce = getCookie(event, STATE_COOKIE);

  deleteCookie(event, STATE_COOKIE, { path: "/api/figshare" });

  const [nonce, posterId] =
    typeof state === "string" ? state.split(".", 2) : [];
  const validState =
    !!nonce &&
    !!expectedNonce &&
    !!posterId &&
    /^\d+$/.test(posterId) &&
    sameValue(nonce, expectedNonce);

  if (!validState) {
    logwatch.warn({
      action: "figshare.oauth.callback",
      message: "Sign in with Figshare returned with a missing or wrong state",
      userId,
    });

    return sendRedirect(event, "/dashboard");
  }

  const publishPage = `/share/${posterId}/publish?repository=figshare`;

  // The user declined on Figshare, or Figshare reported an error. The error is
  // an OAuth code such as access_denied or invalid_request (RFC 6749 4.1.2.1),
  // so only a short code of letters and underscores is passed on to the page.
  if (typeof error === "string" || typeof code !== "string" || !code) {
    const reason =
      typeof error === "string" && /^[a-z_]{1,64}$/i.test(error)
        ? error.toLowerCase()
        : typeof error === "string"
          ? "unknown"
          : "no_code";

    logwatch.warn({
      action: "figshare.oauth.callback",
      message: "Figshare returned to the callback without a code",
      userId,
      error: reason,
      errorDescription:
        typeof errorDescription === "string"
          ? errorDescription.slice(0, 300)
          : undefined,
    });

    const kind = reason === "access_denied" ? "declined" : "refused";

    return sendRedirect(
      event,
      `${publishPage}&figshareError=${kind}&figshareReason=${reason}`,
    );
  }

  await assertNotInMaintenance("figshare");

  const connected = await exchangeFigshareCode(userId, code);

  if (!connected) {
    logwatch.error({
      action: "figshare.oauth.callback",
      message: "Figshare code exchange failed",
      userId,
    });

    return sendRedirect(event, `${publishPage}&figshareError=exchange`);
  }

  logwatch.info({
    action: "figshare.oauth.callback",
    message: "Connected Figshare with OAuth",
    userId,
  });

  return sendRedirect(event, publishPage);
});
