<script lang="ts" setup>
import type { HTMLAttributes } from "vue";
import { cn } from "@inspira-ui/plugins";
import { Motion } from "motion-v";
import { ref } from "vue";

interface FileUploadProps {
  class?: HTMLAttributes["class"];
  multiple?: boolean;
  /**
   * Native file picker filter. Drag and drop ignores `accept`, so always pair it
   * with `validateFile` to actually keep unsupported files out.
   */
  accept?: string;
  /** Returns a reason the file is rejected, or null when it is allowed. */
  validateFile?: (file: File) => string | null;
  /** Helper text under the drop zone, such as accepted types and size limit. */
  hint?: string;
}

const props = withDefaults(defineProps<FileUploadProps>(), {
  multiple: false,
  accept: undefined,
  validateFile: undefined,
  hint: undefined,
});

const emit = defineEmits<{
  (e: "onChange", files: File[]): void;
  (e: "onReject", rejections: { file: File; reason: string }[]): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const files = ref<File[]>([]);
const isActive = ref<boolean>(false);
const rejections = ref<{ name: string; reason: string }[]>([]);

function handleFileChange(newFiles: File[]) {
  const accepted: File[] = [];
  const rejected: { file: File; reason: string }[] = [];

  for (const file of newFiles) {
    const reason = props.validateFile?.(file) ?? null;
    if (reason) {
      rejected.push({ file, reason });
    } else {
      accepted.push(file);
    }
  }

  rejections.value = rejected.map(({ file, reason }) => ({
    name: file.name,
    reason,
  }));

  if (rejected.length) emit("onReject", rejected);

  // Keep a previously accepted selection when every new file was rejected so a
  // mistaken drop does not silently clear a valid file.
  if (!accepted.length) return;

  if (props.multiple) {
    files.value = [...files.value, ...accepted];
  } else {
    files.value = [accepted[0]!];
  }
  emit("onChange", files.value);
}

function removeFile(index: number) {
  files.value = files.value.filter((_, i) => i !== index);
  rejections.value = [];
  emit("onChange", files.value);
  if (fileInputRef.value) fileInputRef.value.value = "";
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files) return;
  handleFileChange(Array.from(input.files));
  // Clear the input so the same file can be picked again after a rejection.
  input.value = "";
}

function handleClick() {
  fileInputRef.value?.click();
}

function handleEnter() {
  isActive.value = true;
}
function handleLeave() {
  isActive.value = false;
}
function handleDrop(e: DragEvent) {
  isActive.value = false;
  const droppedFiles = e.dataTransfer?.files
    ? Array.from(e.dataTransfer.files)
    : [];
  if (droppedFiles.length) handleFileChange(droppedFiles);
}
</script>

<template>
  <ClientOnly>
    <div
      :class="cn(`w-full`, $props.class)"
      @dragover.prevent="handleEnter"
      @dragleave="handleLeave"
      @drop.prevent="handleDrop"
      @mouseover="handleEnter"
      @mouseleave="handleLeave"
    >
      <div
        class="group/file relative block w-full cursor-pointer overflow-hidden rounded-lg p-10"
        @click="handleClick"
      >
        <input
          ref="fileInputRef"
          type="file"
          class="hidden"
          :multiple="multiple"
          :accept="accept"
          @change="onFileChange"
        />

        <!-- Grid pattern -->
        <div
          class="pointer-events-none absolute inset-0 mask-[radial-gradient(ellipse_at_center,white,transparent)]"
        >
          <slot />
        </div>

        <!-- Content -->
        <div class="flex flex-col items-center justify-center">
          <p
            class="relative z-20 font-sans text-base font-bold text-neutral-700 dark:text-neutral-300"
          >
            Upload file
          </p>

          <p
            class="relative z-20 mt-2 font-sans text-base font-normal text-neutral-400 dark:text-neutral-400"
          >
            Drag or drop your files here or click to upload
          </p>

          <p
            v-if="hint"
            class="relative z-20 mt-1 font-sans text-sm font-normal text-neutral-400 dark:text-neutral-500"
          >
            {{ hint }}
          </p>

          <div class="relative mx-auto mt-10 w-full max-w-xl space-y-4">
            <Motion
              v-for="(file, idx) in files"
              :key="`file-${idx}`"
              :initial="{ opacity: 0, scaleX: 0 }"
              :animate="{ opacity: 1, scaleX: 1 }"
              class="relative z-40 mx-auto flex w-full flex-col items-start justify-start overflow-hidden rounded-md bg-white p-4 shadow-sm md:h-24 dark:bg-neutral-900"
            >
              <div class="flex w-full items-center justify-between gap-4">
                <Motion
                  as="p"
                  :initial="{ opacity: 0 }"
                  :animate="{ opacity: 1 }"
                  class="max-w-xs truncate text-base text-neutral-700 dark:text-neutral-300"
                >
                  {{ file.name }}
                </Motion>

                <div class="flex shrink-0 items-center gap-2">
                  <Motion
                    as="p"
                    :initial="{ opacity: 0 }"
                    :animate="{ opacity: 1 }"
                    class="shadow-input rounded-lg px-2 py-1 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-white"
                  >
                    {{ (file.size / (1024 * 1024)).toFixed(2) }} MB
                  </Motion>

                  <button
                    type="button"
                    class="rounded p-1 text-neutral-400 transition-colors hover:bg-gray-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                    @click.stop="removeFile(idx)"
                  >
                    <Icon name="heroicons:x-mark-20-solid" size="16" />
                  </button>
                </div>
              </div>

              <div
                class="mt-2 flex w-full flex-col items-start justify-between text-sm text-neutral-600 md:flex-row md:items-center dark:text-neutral-400"
              >
                <Motion
                  as="p"
                  :initial="{ opacity: 0 }"
                  :animate="{ opacity: 1 }"
                  class="rounded-md bg-gray-100 px-1.5 py-1 text-sm dark:bg-neutral-800"
                >
                  {{ file.type || "unknown type" }}
                </Motion>

                <Motion
                  as="p"
                  :initial="{ opacity: 0 }"
                  :animate="{ opacity: 1 }"
                >
                  modified
                  {{ new Date(file.lastModified).toLocaleDateString() }}
                </Motion>
              </div>
            </Motion>

            <!-- Files the caller refused, e.g. wrong type or too large -->
            <div
              v-for="rejected in rejections"
              :key="`rejected-${rejected.name}`"
              class="relative z-40 mx-auto flex w-full items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-left dark:border-red-900 dark:bg-red-950/50"
            >
              <Icon
                name="heroicons:exclamation-triangle-20-solid"
                class="mt-0.5 shrink-0 text-red-600 dark:text-red-400"
                size="16"
              />

              <div class="min-w-0">
                <p
                  class="truncate text-sm font-medium text-red-800 dark:text-red-200"
                >
                  {{ rejected.name }}
                </p>

                <p class="text-sm text-red-700 dark:text-red-300">
                  {{ rejected.reason }}
                </p>
              </div>
            </div>

            <template v-if="!files.length">
              <Motion
                as="div"
                class="relative z-40 mx-auto mt-4 flex h-32 w-full max-w-32 items-center justify-center rounded-md bg-white shadow-[0px_10px_50px_rgba(0,0,0,0.1)] group-hover/file:shadow-2xl dark:bg-neutral-900"
                :initial="{
                  x: 0,
                  y: 0,
                  opacity: 1,
                }"
                :transition="{
                  type: 'spring',
                  stiffness: 300,
                  damping: 20,
                }"
                :animate="
                  isActive
                    ? {
                        x: 20,
                        y: -20,
                        opacity: 0.9,
                      }
                    : {}
                "
              >
                <Icon
                  name="heroicons:arrow-up-tray-20-solid"
                  class="text-neutral-600 dark:text-neutral-400"
                  size="20"
                />
              </Motion>

              <div
                :class="
                  cn(
                    `absolute inset-0 z-30 mx-auto mt-4 flex h-32 w-full max-w-32 items-center justify-center rounded-md border border-dashed border-sky-400 bg-transparent transition-opacity`,
                    isActive && 'opacity-100',
                    !isActive && 'opacity-0',
                  )
                "
              />
            </template>
          </div>
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<style scoped>
.group-hover\/file\:shadow-2xl:hover {
  box-shadow: 0px 10px 20px rgba(0, 0, 0, 0.25);
}

.transition-opacity {
  transition: opacity 0.3s ease;
}
</style>
