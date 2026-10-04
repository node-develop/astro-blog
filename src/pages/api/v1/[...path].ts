import { createDispatcher, routes } from "~/lib/content-api/routes";

export const prerender = false;
export const ALL = createDispatcher(routes);
