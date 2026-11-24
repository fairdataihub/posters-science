<script setup lang="ts">
import type { ButtonProps } from "@nuxt/ui";
import type { PublishedFilter } from "~/types/dashboard";

// Shown when a kind of Published poster has nothing in it yet, saying how
// posters get there. The wording follows the rest of the app: claims are made
// on Discover, a Conference Organizer Submission on Share Posters uploads
// several posters at once, and publishing edits to a poster makes a version.

const props = defineProps<{
  kind: Exclude<PublishedFilter, "all">;
  /** Posters suggested from the user's ORCID iD, for the Claimed kind. */
  suggestionCount: number;
  /** Deleted posters are hidden, so some may be left out. */
  deletedHidden?: boolean;
}>();

const emit = defineEmits<{
  /** Open the Suggested view. */
  showSuggested: [];
}>();

const content = computed(() => {
  switch (props.kind) {
    case "owned":
      return {
        icon: "i-lucide-upload",
        title: "No posters shared by you yet",
        description: "Posters you share and publish will appear here.",
        actions: [{ label: "Share Posters", to: "/share" }],
      };
    case "claimed":
      return {
        icon: "i-heroicons-hand-raised",
        title: "No claimed posters yet",
        description:
          props.suggestionCount > 0
            ? `Claim posters you authored on Discover and they will appear here. ${props.suggestionCount.toLocaleString()} auto-indexed ${props.suggestionCount === 1 ? "poster lists" : "posters list"} your ORCID iD in Suggested.`
            : "Claim posters you authored on Discover and they will appear here.",
        actions: [
          ...(props.suggestionCount > 0
            ? [
                {
                  label: "View suggested posters",
                  icon: "i-simple-icons-orcid",
                  onClick: () => emit("showSuggested"),
                },
              ]
            : []),
          { label: "Find Posters", to: "/discover" },
        ],
      };
    case "bulk":
      return {
        icon: "i-lucide-library-big",
        title: "No bulk uploads yet",
        description:
          "Share a conference's posters together with a Conference Organizer Submission on Share Posters, and they will appear here.",
        actions: [{ label: "Share Posters", to: "/share" }],
      };
    // Multiple versions
    default:
      return {
        icon: "i-lucide-history",
        title: "No posters with more than one version yet",
        description:
          "Edit a published poster from its card. Publishing your changes creates a new version, and the poster will appear here.",
        actions: [],
      };
  }
});

const actions = computed((): ButtonProps[] =>
  content.value.actions.map((action, index) => ({
    ...action,
    color: index === 0 ? "primary" : "neutral",
    variant: index === 0 ? "solid" : "outline",
  })),
);
</script>

<template>
  <UEmpty
    :icon="content.icon"
    :title="content.title"
    :description="
      deletedHidden
        ? `${content.description} Deleted posters are hidden.`
        : content.description
    "
    :actions="actions"
    variant="naked"
    class="py-12"
  />
</template>
