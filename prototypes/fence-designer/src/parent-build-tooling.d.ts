// The repository root does not install nested prototype devDependencies during
// its Next.js build. These declarations let the parent TypeScript pass inspect
// this isolated package without coupling the root package to Vite or Vitest.
declare module "vite" {
  export function defineConfig(config: unknown): unknown;
}

declare module "@vitejs/plugin-react" {
  const react: () => unknown;
  export default react;
}

declare module "vitest" {
  export const describe: (name: string, run: () => void) => void;
  export const it: (name: string, run: () => void) => void;
  export const expect: (value: unknown) => any;
}
