<script setup lang="ts">
import type { MyCollection } from "#shared/types/collection";
import {
  COLLECTION_SLUG_MAX,
  collectionSlugSchema,
  suggestCollectionSlug,
} from "#shared/utils/collection";
import { parseApiError } from "~/utils/apiError";

// The optional custom link, /collection/<slug>. The id link keeps working and
// redirects to it.

const props = defineProps<{
  collection: MyCollection;
}>();

const emit = defineEmits<{
  saved: [collection: MyCollection];
}>();

const toast = useToast();
const { origin } = useRequestURL();

const slug = ref(props.collection.slug ?? "");
const error = ref<string | undefined>();
const saving = ref(false);
const removing = ref(false);

watch(
  () => props.collection.slug,
  (value) => {
    slug.value = value ?? "";
  },
);

watch(slug, () => {
  error.value = undefined;
});

const typed = computed(() => slug.value.trim().toLowerCase());
const unchanged = computed(() => typed.value === (props.collection.slug ?? ""));
const preview = computed(() =>
  typed.value ? `${origin}/collection/${typed.value}` : "",
);

function useName() {
  slug.value = suggestCollectionSlug(props.collection.name);
}

async function send(next: string | null) {
  const updated = await $fetch<MyCollection>(
    `/api/collections/${encodeURIComponent(props.collection.id)}`,
    { method: "PATCH", body: { slug: next } },
  );

  window.umami?.track("collection_link_changed", { set: next !== null });
  emit("saved", updated);
}

async function save() {
  const parsed = collectionSlugSchema.safeParse(slug.value);

  if (!parsed.success) {
    error.value = parsed.error.issues[0]?.message ?? "Check the link";

    return;
  }

  saving.value = true;

  try {
    await send(parsed.data);
    toast.add({
      title: "Custom link saved",
      description: `The collection is now at /collection/${parsed.data}.`,
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    const { statusCode, statusMessage } = parseApiError(err);

    if (statusCode === 400 || statusCode === 409) {
      error.value = statusMessage ?? "That link can't be used.";
    } else {
      toast.add({
        title: "Could not save the link",
        description: statusMessage ?? "Something went wrong. Try again.",
        color: "error",
        icon: "i-heroicons-exclamation-circle",
      });
    }
  } finally {
    saving.value = false;
  }
}

async function remove() {
  removing.value = true;

  try {
    await send(null);
    toast.add({
      title: "Custom link removed",
      description: "The collection's id link still works.",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    toast.add({
      title: "Could not remove the link",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    removing.value = false;
  }
}
</script>

<template>
  <form class="space-y-3" @submit.prevent="save">
    <p class="text-muted text-sm">
      Optional. Give the collection an address that matches its name. Links that
      use its id keep working and open the custom one.
    </p>

    <UFormField name="slug" :error="error">
      <UFieldGroup class="w-full">
        <UBadge
          color="neutral"
          variant="outline"
          size="lg"
          label="/collection/"
        />

        <UInput
          v-model="slug"
          :maxlength="COLLECTION_SLUG_MAX"
          placeholder="e.g. agu-2026-lab-posters"
          autocomplete="off"
          spellcheck="false"
          aria-label="Custom link"
          class="min-w-0 flex-1"
        />
      </UFieldGroup>
    </UFormField>

    <p v-if="preview && !unchanged" class="text-muted text-xs break-all">
      New link: {{ preview }}
    </p>

    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Changing or removing the custom link breaks links that use the old one."
      :description="`The id link, ${origin}${collection.idPath}, always works.`"
      :ui="{ description: 'break-all' }"
    />

    <div class="flex flex-wrap items-center gap-2">
      <UButton
        type="submit"
        size="sm"
        label="Save link"
        :disabled="unchanged || !typed"
        :loading="saving"
      />

      <UButton
        size="sm"
        color="neutral"
        variant="subtle"
        icon="i-lucide-type"
        label="Use the name"
        @click="useName"
      />

      <UButton
        v-if="collection.slug"
        size="sm"
        color="neutral"
        variant="ghost"
        label="Remove custom link"
        :loading="removing"
        @click="remove"
      />
    </div>
  </form>
</template>
