import { cva } from "class-variance-authority";

export const iconTileStyles = cva(
  "inline-flex shrink-0 items-center justify-center bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
  {
    variants: {
      size: {
        regular: "size-9 rounded-xl",
        small: "size-8 rounded-lg",
      },
    },
    defaultVariants: { size: "regular" },
  },
);
