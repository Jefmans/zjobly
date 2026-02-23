import rawRuntimeConfig from "../../../../config/runtime.json";

export type RuntimeConfig = typeof rawRuntimeConfig;

export const runtimeConfig = rawRuntimeConfig as RuntimeConfig;
