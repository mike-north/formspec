import net from "node:net";
import {
  isFormSpecSemanticResponse,
  type FormSpecSemanticResponse,
} from "../../packages/analysis/src/protocol.js";

export const FORM_SPEC_PLUGIN_TEST_SOCKET_TIMEOUT_MS = 1_000;

export async function queryPluginSocket(
  address: string,
  payload: object
): Promise<FormSpecSemanticResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(address);
    let buffer = "";

    socket.setEncoding("utf8");
    socket.setTimeout(FORM_SPEC_PLUGIN_TEST_SOCKET_TIMEOUT_MS, () => {
      socket.destroy(new Error(`Timed out waiting for FormSpec plugin response from ${address}`));
    });
    socket.on("connect", () => {
      socket.write(`${JSON.stringify(payload)}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += String(chunk);
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }

      socket.end();
      try {
        const response = JSON.parse(buffer.slice(0, newlineIndex)) as unknown;
        if (!isFormSpecSemanticResponse(response)) {
          reject(
            new Error(
              `Invalid FormSpec plugin response payload from ${address}: ${buffer.slice(0, newlineIndex)}`
            )
          );
          return;
        }
        resolve(response);
      } catch (error) {
        reject(
          new Error(
            `Failed to parse FormSpec plugin response from ${address}: ${
              error instanceof Error ? error.message : String(error)
            }\nPayload: ${buffer.slice(0, newlineIndex)}`
          )
        );
      }
    });
    socket.on("error", reject);
  });
}
