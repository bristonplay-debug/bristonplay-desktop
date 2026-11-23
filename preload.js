// Identidade fixa do computador (não muda ao reinstalar o app nem ao trocar de rede).
const { contextBridge } = require("electron");
const os = require("os");
const { execSync } = require("child_process");

function machineId() {
  try {
    if (process.platform === "win32") {
      const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { encoding: "utf8", windowsHide: true, timeout: 3000 });
      const m = out.match(/MachineGuid\s+REG_SZ\s+([\w-]+)/i); if (m) return "win:" + m[1];
    } else if (process.platform === "darwin") {
      const out = execSync("ioreg -rd1 -c IOPlatformExpertDevice", { encoding: "utf8", timeout: 3000 });
      const m = out.match(/"IOPlatformUUID"\s*=\s*"([\w-]+)"/); if (m) return "mac:" + m[1];
    }
  } catch (e) { /* usa o plano B */ }
  const macs = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach((k) => (nets[k] || []).forEach((n) => { if (!n.internal && n.mac && n.mac !== "00:00:00:00:00:00") macs.push(n.mac); }));
  macs.sort();
  return "host:" + os.hostname() + "|" + (macs[0] || "");
}

const plat = process.platform === "darwin" ? "Mac" : process.platform === "win32" ? "Windows" : "Linux";
contextBridge.exposeInMainWorld("BPDesk", {
  seed: machineId(),
  model: "Computador " + plat + " (" + os.hostname() + ")",
  platform: plat,
});
