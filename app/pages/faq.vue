<script setup lang="ts">
import { useEventListener } from "@vueuse/core";

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("FAQ - Posters.science")}&description=${encodeURIComponent("Answers to common questions about Posters.science")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "FAQ - Posters.science",
  description:
    "Answers to common questions about finding, sharing and claiming scientific posters on Posters.science.",
  ogTitle: "FAQ - Posters.science",
  ogDescription:
    "Answers to common questions about finding, sharing and claiming scientific posters on Posters.science.",
  ogImage,
});

const { data: faq } = await useAsyncData(() =>
  queryCollection("content").path("/faq").first(),
);

if (!faq.value) {
  throw showError({ statusCode: 404, statusMessage: "Page not found" });
}

// Sections and their questions, parsed from the ## and ### headings.
const tocLinks = computed(() => faq.value?.body?.toc?.links ?? []);
const tocIds = computed(() =>
  tocLinks.value.flatMap((section) => [
    section.id,
    ...(section.children ?? []).map((question) => question.id),
  ]),
);

const tocOpen = ref(false);

// The heading being read: the last one that has scrolled up past a line a
// quarter of the way down the screen. The table of contents' own highlight
// marks every heading on screen, often five or six at once, so the page
// tracks a single one.
const currentHeadingId = ref<string | null>(null);

function updateCurrentHeading() {
  const ids = tocIds.value;
  const readingLine = Math.max(120, window.innerHeight / 4);
  let current = ids[0] ?? null;

  for (const id of ids) {
    const heading = document.getElementById(id);

    if (!heading) continue;
    if (heading.getBoundingClientRect().top > readingLine) break;

    current = id;
  }

  // The last answers are too short to reach the top, so at the bottom of the
  // page the last question counts as the one being read.
  const atBottom =
    window.innerHeight + window.scrollY >=
    document.documentElement.scrollHeight - 2;

  currentHeadingId.value = atBottom ? (ids.at(-1) ?? current) : current;
}

let headingFrame = 0;

function scheduleHeadingUpdate() {
  cancelAnimationFrame(headingFrame);
  headingFrame = requestAnimationFrame(updateCurrentHeading);
}

useEventListener("scroll", scheduleHeadingUpdate, { passive: true });
useEventListener("resize", scheduleHeadingUpdate, { passive: true });
onMounted(() => nextTick(updateCurrentHeading));
onBeforeUnmount(() => cancelAnimationFrame(headingFrame));

const currentSectionId = computed(
  () =>
    tocLinks.value.find(
      (section) =>
        section.id === currentHeadingId.value ||
        section.children?.some(
          (question) => question.id === currentHeadingId.value,
        ),
    )?.id ?? null,
);

// On desktop only the current section's questions are listed, so the whole
// list fits on screen and the highlight never ends up out of view. The phone
// list keeps every question, since it's opened to jump anywhere.
const tocDisplayLinks = computed(() =>
  tocLinks.value.map((section) => {
    const isCurrentSection = section.id === currentSectionId.value;

    return {
      ...section,
      ui: { itemWithChildren: isCurrentSection ? "" : "lg:[&>ul]:hidden" },
      children: section.children?.map((question) => ({
        ...question,
        // Overrides the table of contents' own highlight on every heading
        // that's on screen, leaving only the one being read.
        class:
          question.id === currentHeadingId.value
            ? "text-primary dark:text-primary-400 before:absolute before:inset-y-1 before:-start-[13px] before:w-0.5 before:rounded-full before:bg-primary dark:before:bg-primary-400"
            : "text-muted hover:text-default",
      })),
    };
  }),
);

const tocUi = {
  // On phones the list opens over the answers instead of pushing them down,
  // so closing it after a pick doesn't move the question out of view. On
  // desktop it sits in the left column, lined up with the page edge, only as
  // tall as its links so the footer doesn't push it up at the end.
  root: "max-lg:overflow-visible lg:mx-0 lg:ps-0 lg:pe-4 lg:self-start",
  content:
    "max-lg:absolute max-lg:inset-x-0 max-lg:top-full max-lg:max-h-[60vh] max-lg:overflow-y-auto max-lg:border-b max-lg:border-default max-lg:bg-default max-lg:px-4 max-lg:pb-4 max-lg:shadow-lg sm:max-lg:px-6",
  // Room between sections, and a guide line down the left of each section's
  // questions so they read as one group.
  itemWithChildren: "not-first:mt-3",
  listWithChildren: "ms-0.5 mt-1 border-s border-default ps-3",
};

// The answers themselves, on this page only (Terms and Privacy share the
// prose styles): each section opens with a divider and more room, and each
// question is a smaller heading that sits close to its answer.
const faqContentClass = [
  "[&_h2]:mt-16 [&_h2]:border-t [&_h2]:border-default [&_h2]:pt-10",
  "[&_h3]:mt-10 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold",
  "[&_h2+h3]:mt-0 [&_h3+p]:mt-2",
].join(" ");
</script>

<template>
  <!-- The site header isn't sticky, so the table of contents and heading
       anchors don't need to leave room for it. -->
  <UContainer class="py-12 [--ui-header-height:0px]">
    <UPage
      :ui="{ root: 'gap-8', left: 'lg:col-span-3', center: 'lg:col-span-7' }"
    >
      <template v-if="tocLinks.length" #left>
        <UContentToc
          v-model:open="tocOpen"
          :links="tocDisplayLinks"
          color="neutral"
          :ui="tocUi"
          @move="tocOpen = false"
        >
          <!-- Sections are small labels; questions are long, so they wrap
               instead of truncating. -->
          <template #link="{ link }">
            <span
              v-if="link.depth === 2"
              class="text-xs font-semibold tracking-wide uppercase"
              :class="
                link.id === currentSectionId
                  ? 'text-primary dark:text-primary-400'
                  : 'text-highlighted group-hover:text-primary dark:group-hover:text-primary-400'
              "
            >
              {{ link.text }}
            </span>

            <span v-else class="leading-snug">{{ link.text }}</span>
          </template>
        </UContentToc>
      </template>

      <ContentRenderer :value="faq!" :class="faqContentClass" />
    </UPage>
  </UContainer>
</template>
