import rawConfig from "../../../../config/appConfig.json";

export type AppConfig = typeof rawConfig;

export const appConfig = rawConfig as AppConfig;
