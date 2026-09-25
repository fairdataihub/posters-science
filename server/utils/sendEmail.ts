import { Resend } from "resend";
import { logwatch } from "./logwatch";

/**
 * Send a transactional email via Resend.
 *
 * To swap to a different provider (e.g. Azure Communication Services),
 * replace the implementation of this function only - all callers stay the same.
 *
 * Every send is logged with the Resend email id. Resend only confirms that it
 * accepted the message; whether it was then delivered or bounced is shown
 * against that id in the Resend dashboard.
 */
export const sendEmail = async (options: {
  to: string;
  subject: string;
  html: string;
  /** Extra fields for the send log, such as the user and flow behind it. */
  logContext?: Record<string, unknown>;
}) => {
  const config = useRuntimeConfig();
  const resend = new Resend(config.resendApiKey);

  const { data, error } = await resend.emails.send({
    from: "Posters.science <noreply@posters.science>",
    to: [options.to],
    subject: options.subject,
    html: options.html,
  });

  // The recipient domain is enough to spot one institution's mail server
  // rejecting everything, without writing full addresses into the logs.
  const recipientDomain = options.to.split("@")[1] ?? "unknown";

  if (error) {
    logwatch.error({
      ...options.logContext,
      action: "email.send",
      message: "Resend rejected the email",
      subject: options.subject,
      recipientDomain,
      resendError: error,
    });

    throw createError({
      statusCode: 500,
      statusMessage: "Failed to send email",
    });
  }

  logwatch.info({
    ...options.logContext,
    action: "email.send",
    message: "Email accepted by Resend",
    subject: options.subject,
    recipientDomain,
    emailId: data?.id,
  });
};
