// BristonPlay para computador: abre o mesmo app das TVs numa janela.
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let win = null;
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function create() {
  win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 960, minHeight: 540,
    backgroundColor: "#07070A", title: "BristonPlay", show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, sandbox: false,
      webSecurity: false, // listas IPTV usam http e servidores sem CORS
      backgroundThrottling: false,
    },
  });
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]));
  } else {
    Menu.setApplicationMenu(null);
  }
  win.loadFile(path.join(__dirname, "app", "index.html"));
  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11" || (input.key === "Enter" && input.alt)) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.on("closed", () => { win = null; });
}

app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
