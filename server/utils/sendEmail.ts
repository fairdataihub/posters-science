import { Resend } from "resend";

/**
 * Send a transactional email via Resend.
 *
 * To swap to a different provider (e.g. Azure Communication Services),
 * replace the implementation of this function only — all callers stay the same.
 */
export const sendEmail = async (options: {
  to: string;
  subject: string;
  html: string;
}) => {
  const config = useRuntimeConfig();
  const resend = new Resend(config.resendApiKey);

  const { error } = await resend.emails.send({
    from: "Posters.Science <noreply@posters.science>",
    to: [options.to],
    subject: options.subject,
    html: options.html,
  });

  if (error) {
    console.error("Error sending email:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to send email",
    });
  }
};
