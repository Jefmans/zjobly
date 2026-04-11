import rawRuntimeConfig from "../../../../config/runtime.json";

export type RuntimeConfig = typeof rawRuntimeConfig;

export const runtimeConfig = rawRuntimeConfig as RuntimeConfig;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const replaceObjectContents = (target: Record<string, unknown>, source: Record<string, unknown>) => {
  Object.keys(target).forEach((key) => {
    if (!(key in source)) {
      delete target[key];
    }
  });
  Object.entries(source).forEach(([key, value]) => {
    target[key] = value;
  });
};

export const applyRuntimeConfig = (nextRuntime: unknown): void => {
  if (!isPlainObject(nextRuntime)) return;
  replaceObjectContents(runtimeConfig as unknown as Record<string, unknown>, nextRuntime);
};
