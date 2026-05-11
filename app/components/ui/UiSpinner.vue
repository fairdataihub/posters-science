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
      :class="
        cn(
          'transition-[filter,opacity] duration-300 ease-in-out',
          props.loading && 'pointer-events-none opacity-70 blur-sm',
        )
      "
    >
      <slot />
    </div>

    <Transition
      enter-active-class="fast-fade-blur-enter-active"
      enter-from-class="fast-fade-blur-enter-from"
      enter-to-class="fast-fade-blur-enter-to"
      leave-active-class="fast-fade-blur-leave-active"
      leave-from-class="fast-fade-blur-leave-from"
      leave-to-class="fast-fade-blur-leave-to"
    >
      <div
        v-if="props.loading"
        :class="
          cn(
            'absolute inset-0 z-50 flex items-center justify-center',
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

<style scoped>
.blur-enter-from,
.blur-leave-to {
  filter: blur(0.5rem);
  opacity: 0;
}

.blur-enter-active,
.blur-leave-active {
  transition: all 1s ease-in;
}

.fast-fade-blur-enter-from,
.fast-fade-blur-leave-to {
  filter: blur(0.5rem);
  opacity: 0;
}

.fast-fade-blur-enter-active,
.fast-fade-blur-leave-active {
  transition: all 0.3s ease-in;
}
</style>
