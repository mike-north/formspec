import net from "node:net";
import {
  isFormSpecSemanticResponse,
  type FormSpecSemanticResponse,
} from "../../packages/analysis/src/protocol.js";

export const FORM_SPEC_PLUGIN_TEST_SOCKET_TIMEOUT_MS = 5_000;

export async function queryPluginSocket(
  address: string,
  payload: object
): Promise<FormSpecSemanticResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(address);
    let buffer = "";
    let settled = false;

    const finish = (handler: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      handler();
    };

    socket.setEncoding("utf8");
    socket.setTimeout(FORM_SPEC_PLUGIN_TEST_SOCKET_TIMEOUT_MS, () => {
      finish(() => {
        socket.destroy();
        reject(new Error(`Timed out waiting for FormSpec plugin response from ${address}`));
      });
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

      finish(() => {
        socket.end();
        const message = buffer.slice(0, newlineIndex);
        try {
          const response = JSON.parse(message) as unknown;
          if (!isFormSpecSemanticResponse(response)) {
            reject(
              new Error(`Invalid FormSpec plugin response payload from ${address}: ${message}`)
            );
            return;
          }
          resolve(response);
        } catch (error) {
          reject(
            new Error(
              `Failed to parse FormSpec plugin response from ${address}: ${
                error instanceof Error ? error.message : String(error)
              }\nPayload: ${message}`
            )
          );
        }
      });
    });
    socket.on("error", (error) => {
      finish(() => {
        reject(error);
      });
    });
  });
}
