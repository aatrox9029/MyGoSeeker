import { ensureNativePort } from "../background/native-port.js";
import { createRequestId } from "./protocol.js";
export async function checkNativeHealth() {
  try {
    const port = await ensureNativePort(true), requestId = createRequestId("health");
    const data = await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); port.onMessage.removeListener(receive); port.onDisconnect.removeListener(disconnect); };
      const receive = (message) => { if (message.requestId === requestId && message.type === "HEALTH_STATUS") { cleanup(); resolve(message); } };
      const disconnect = () => { cleanup(); reject(new Error("Native helper disconnected")); };
      const timer = setTimeout(() => { cleanup(); reject(new Error("Native helper health check timed out; install the latest NativeHelper EXE")); }, 12000);
      port.onMessage.addListener(receive); port.onDisconnect.addListener(disconnect);
      try { port.postMessage({ type: "HEALTH_CHECK", requestId }); } catch (error) { cleanup(); reject(error); }
    });
    return data;
  } catch (error) { return { connected: false, ffmpeg: false, ffprobe: false, error: error.message }; }
}
