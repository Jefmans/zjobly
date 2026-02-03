import rawConfig from "./appConfig.json";

export type AppConfig = typeof rawConfig;

export const appConfig = rawConfig as AppConfig;
