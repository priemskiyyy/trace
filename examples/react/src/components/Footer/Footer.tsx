import type React from "react";

export const Footer: React.FunctionComponent = () => (
  <footer className="border-t border-zinc-200/70 dark:border-zinc-800">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-8 text-sm text-zinc-500 sm:px-6">
      <span>
        Every destination runs inside this page, over a simulated SDK or
        backend, so nothing leaves your browser and no provider account is
        needed.
      </span>
      <a
        href="https://github.com/priemskiyyy/trace"
        className="underline-offset-2 hover:underline sm:ml-auto"
      >
        Trace on GitHub
      </a>
    </div>
  </footer>
);
