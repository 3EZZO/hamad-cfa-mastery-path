import { handleAccessGate, type AccessGateContext } from "./accessGate";

export function onRequest(context: AccessGateContext): Promise<Response> {
  return handleAccessGate(context);
}
