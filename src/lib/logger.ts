import pino, { type LoggerOptions } from "pino";

export type Logger = ReturnType<typeof createLogger>;

export const createLogger = (level: string = process.env.LOG_LEVEL ?? "info") => {
  const options: LoggerOptions = { level };
  if (process.env.NODE_ENV !== "production") {
    options.transport = { target: "pino-pretty", options: { colorize: true } };
  }
  return pino(options);
};

export const logger: Logger = createLogger();
