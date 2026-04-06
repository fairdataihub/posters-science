export default defineAppConfig({
  ui: {
    button: {
      defaultVariants: {
        size: "lg",
      },
      slots: {
        base: "cursor-pointer",
      },
    },
    colors: {
      neutral: "zinc",
      primary: "pink",
    },
    alert: {
      compoundVariants: [
        {
          color: "warning" as const,
          variant: "subtle" as const,
          class: {
            root: "bg-[#fffbeb] dark:bg-[#451a03] text-[#92400e] dark:text-[#fef3c7] ring ring-inset ring-[#fde68a] dark:ring-[#92400e]",
            icon: "text-[#d97706] dark:text-[#fbbf24]",
          },
        },
        {
          color: "success" as const,
          variant: "subtle" as const,
          class: {
            root: "bg-[#f0fdf4] dark:bg-[#052e16] text-[#14532d] dark:text-[#dcfce7] ring ring-inset ring-[#bbf7d0] dark:ring-[#166534]",
            icon: "text-[#16a34a] dark:text-[#4ade80]",
          },
        },
        {
          color: "success" as const,
          variant: "solid" as const,
          class: {
            root: "bg-[#16a34a] dark:bg-[#15803d] text-white",
            icon: "text-white",
          },
        },
        {
          color: "error" as const,
          variant: "soft" as const,
          class: {
            root: "bg-[#fef2f2] dark:bg-[#450a0a] text-[#991b1b] dark:text-[#fecaca]",
            icon: "text-[#dc2626] dark:text-[#f87171]",
          },
        },
      ],
    },
    input: {
      slots: {
        root: "w-full",
      },
    },
    header: {
      slots: {
        root: "bg-default/75 backdrop-blur border-b border-default h-(--ui-header-height) static",
      },
    },
    link: {
      base: "hover:underline",
      variants: {
        active: {
          false: "text-primary-500",
        },
      },
      compoundVariants: [
        {
          active: false,
          disabled: false,
          class: ["hover:text-primary-600", "transition-all"],
        },
      ],
    },
  },
});
