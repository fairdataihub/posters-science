export async function validateZenodoToken(userId: string) {
  let message = "";
  const zenodoToken = false;
  const tokenExists = await prisma.zenodoToken.findUnique({
    where: {
      userId,
    },
  });

  if (tokenExists) {
    // Token exists, ensure is still valid
    const zenodoTokenInfo = await fetch(
      `${ZENODO_ENDPOINT}/api/deposit/depositions?access_token=${tokenExists.accessToken}`,
    );

    if (!zenodoTokenInfo.ok) {
      // Token invalid or expired
      message = "Zenodo token is invalid or expired";
      await prisma.zenodoToken.delete({
        where: userId,
      });
    } else {
      // Token valid - refresh it to extend the session
      await refreshZenodoToken(userId, tokenExists.refreshToken);

      zenodoToken = true;
      message = "Zenodo token is valid";

      const responseData = await zenodoTokenInfo.json();

      for (const deposition of responseData) {
        existingDepositions.push({
          id: deposition.id,
          title: deposition.metadata.title,
          state: deposition.state,
          submitted: deposition.submitted,
          conceptrecid: deposition.conceptrecid,
        });
      }
    }
  } else {
    message = "No Zenodo token found";
  }

  return { zenodoToken, message, existingDepositions };
}

async function refreshZenodoToken(userId: string, refreshToken: string) {
  const refreshBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: ZENODO_CLIENT_ID,
    client_secret: ZENODO_CLIENT_SECRET,
  });

  const refresh = await fetch(`${ZENODO_ENDPOINT}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: refreshBody.toString(),
  });

  if (refresh.ok) {
    const { access_token, refresh_token, expires_in } = await refresh.json();
    await prisma.zenodoToken.update({
      where: { userId },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
      },
    });
  }
}
