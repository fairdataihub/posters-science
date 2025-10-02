import { createTransport } from "nodemailer";

export const sendEmail = async (to: string, subject: string, text: string) => {
  const config = useRuntimeConfig();

  const transporter = createTransport({
    auth: {
      pass: config.mailPass,
      user: config.mailUser,
    },
    host: config.mailHost,
    port: Number(config.mailPort),
  });

  const htmlContent = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta http-equiv="x-ua-compatible" content="ie=edge">
      <title>Email Confirmation</title>
      <style>
        body {
          background-color: #e9ecef;
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          max-width: 600px;
          margin: auto;
          background: #ffffff;
          border-top: 3px solid #d4dadf;
        }
        h2 {
          font-size: 32px;
          font-weight: 700;
          text-align: center;
          padding: 36px 24px 0;
        }
        p {
          font-size: 16px;
          line-height: 24px;
          padding: 24px;
          text-align: center;
        }
        .button-container {
          text-align: center;
          padding: 12px;
        }
        .button {
          background-color: #1a82e2;
          color: #ffffff;
          padding: 16px 36px;
          text-decoration: none;
          display: inline-block;
          border-radius: 6px;
          font-size: 16px;
        }
      </style>
    </head>
    <body>
      <table>
        <tr>
          <td>
            <h2>Confirm Your Email Address</h2>
            <p>Please verify your email address by clicking the button below.</p>
            <div class="button-container">
              <a href="${text}" class="button" target="_blank">Verify My Email</a>
            </div>
            <p>If the button does not work, please use the following link to verify your email:</p>
            <p><a href="${text}">${text}</a></p>
            <p>If you did not request this, please ignore this email.</p>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;

  await transporter.sendMail({
    from: config.mailFrom,
    html: htmlContent,
    subject,
    text,
    to,
  });
};
