// ISO 7064 mod 11,2 checksum validation.
// Accepts full URL (https://orcid.org/XXXX-...) or bare XXXX-XXXX-XXXX-XXXX.
export function isValidOrcidChecksum(value: string): boolean {
  const bare = value.replace(/.*orcid\.org\//i, "").trim();
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(bare)) return false;
  const digits = bare.replace(/-/g, "");
  let total = 0;
  for (let i = 0; i < 15; i++) {
    total = (total + parseInt(digits[i]!, 10)) * 2;
  }
  const remainder = total % 11;
  const result = (12 - remainder) % 11;
  const checkChar = result === 10 ? "X" : String(result);

  return digits[15] === checkChar;
}

// Checks whether an ORCID ID actually exists in the ORCID public registry.
// Returns true on network failure so callers are never blocked by connectivity issues.
export async function validateOrcidExists(orcidId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://pub.orcid.org/v3.0/${orcidId}`, {
      headers: { Accept: "application/json" },
    });

    return res.ok;
  } catch {
    return true;
  }
}
