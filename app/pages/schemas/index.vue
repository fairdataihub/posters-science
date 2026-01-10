<script setup lang="ts">
import schemaListJSON from "../../../public/filesList.json";

definePageMeta({
  layout: false,
});

useSeoMeta({
  title: "Poster.Science Schemas",
  description: "A collection of schemas used in poster.science applications",
});
</script>

<template>
  <main
    class="flex min-h-screen flex-col items-start justify-start bg-black p-24 text-slate-50"
  >
    <h1 class="text-5xl font-bold">Poster.Science Schemas</h1>

    <h2 class="mt-6 mb-3 px-5 text-base font-medium">
      A collection of schemas used in poster.science applications
    </h2>

    <hr class="mt-4 mb-8 h-[1px] w-full border-slate-700 px-5" />

    <div
      v-for="schema in schemaListJSON"
      :key="schema.fileName"
      class="relative mb-8 px-4"
    >
      <h3 class="text-2xl font-semibold">{{ schema.title }}</h3>

      <p class="mt-1 mb-3 text-sm text-slate-200">
        {{ schema.description }}
      </p>

      <hr
        class="mt-4 mb-5 h-[1px] w-full border-dashed border-slate-700 px-5"
      />

      <ul>
        <li
          v-for="version in schema.versions"
          :key="version.label"
          class="mb-2 ml-4 w-max cursor-pointer list-disc rounded-lg border border-transparent transition-all hover:border-slate-500"
        >
          <a
            :href="version.url"
            class="flex w-full items-center px-3 py-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            <p class="text-2xl font-semibold">
              {{ version.label }}
              {{ ` ` }}
              <span>-&gt;</span>
            </p>
          </a>
        </li>
      </ul>
    </div>
  </main>
</template>
