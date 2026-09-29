import type {
  ActiveMaintenance,
  MaintenanceKey,
} from "#shared/utils/maintenance";

/**
 * Which workflows an admin has paused. Shared across every consumer on a page
 * through a single keyed fetch, similar to how `feedbackOpen` is shared.
 */
export function useMaintenance() {
  const { data, refresh, status } = useFetch<{ active: ActiveMaintenance[] }>(
    "/api/maintenance",
    { key: "maintenance", default: () => ({ active: [] }) },
  );

  const active = computed(() => data.value?.active ?? []);

  const entryFor = (key: MaintenanceKey) =>
    active.value.find((entry) => entry.key === key) ?? null;

  const isActive = (key: MaintenanceKey) => entryFor(key) !== null;

  const messageFor = (key: MaintenanceKey) => entryFor(key)?.message ?? "";

  return { active, entryFor, isActive, messageFor, refresh, status };
}
