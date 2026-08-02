import handler from "vinext/server/fetch-handler";

export default {
  fetch(request: Request): Promise<Response> {
    return handler.fetch(request);
  },
};
