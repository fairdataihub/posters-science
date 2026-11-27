/**
 * The release a batch's wizard was last opened on: a number that goes up on
 * every deploy (the deploy workflow's run number, NUXT_PUBLIC_WIZARD_RELEASE).
 * A batch last opened on a lower release starts again at the first step.
 * 0 in development, so local work is sent back at most once.
 */
export function currentWizardRelease(): number {
  return wizardReleaseNumber(useRuntimeConfig().public.wizardRelease);
}

/** The runtime value as a whole number (env values may arrive as text). */
export function wizardReleaseNumber(value: unknown): number {
  const release = Number(value);

  return Number.isInteger(release) && release > 0 ? release : 0;
}
