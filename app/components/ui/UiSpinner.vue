<script setup lang="ts">
import cn from "~/utils/cn";

interface UiSpinnerProps {
  loading?: boolean;
  size?: "sm" | "md" | "lg";
  overlay?: boolean;
  overlayClass?: string;
  spinnerClass?: string;
  class?: string;
}

const props = withDefaults(defineProps<UiSpinnerProps>(), {
  loading: true,
  size: "md",
  overlay: false,
  overlayClass: "",
  spinnerClass: "",
  class: "",
});

const slots = useSlots();
const hasContent = computed(() => slots.default && slots.default().length > 0);

const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-8 h-8",
  lg: "w-12 h-12",
};
</script>

<template>
  <!-- Wrapper mode: show content with overlay when loading -->
  <div v-if="overlay && hasContent" :class="cn('relative', props.class)">
    <div
      :class="cn('transition-opacity', props.loading && 'pointer-events-none')"
    >
      <slot />
    </div>

    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="props.loading"
        :class="
          cn(
            'absolute inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/30',
            props.overlayClass,
          )
        "
      >
        <Icon
          name="svg-spinners:blocks-wave"
          :class="
            cn(
              sizeClasses[props.size],
              'text-primary-500 dark:text-primary-400',
              props.spinnerClass,
            )
          "
        />
      </div>
    </Transition>
  </div>

  <!-- Standalone mode: just show spinner -->
  <div v-else :class="cn('flex items-center justify-center', props.class)">
    <Icon
      v-if="props.loading"
      name="svg-spinners:blocks-wave"
      :class="
        cn(
          sizeClasses[props.size],
          'text-primary-500 dark:text-primary-400',
          props.spinnerClass,
        )
      "
    />

    <slot v-else />
  </div>
</template>
