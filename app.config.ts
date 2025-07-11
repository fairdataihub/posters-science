export default defineAppConfig({
  ui: {
    button: {
      defaultVariants: {
        size: "lg",
      },
      slots: {
        base: "cursor-pointer rounded-lg",
      },
    },
    colors: {
      neutral: "zinc",
      primary: "emerald",
    },
    input: {
      slots: {
        root: "w-full",
      },
    },
  },
});
