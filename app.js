"use strict";

const IQOS_BLE = {
  service: "daebb240-b041-11e4-9e45-0002a5d5c51b",
  scpControl: "e16c6e20-b041-11e4-a4c3-0002a5d5c51b",
  battery: "f8a54120-b041-11e4-9be7-0002a5d5c51b"
};

const COMMANDS = {
  brightness: [0x00, 0xC0, 0x02, 0x23, 0xC3],
  batteryVoltage: [0x00, 0xC0, 0x00, 0x21, 0xE7],
  telemetry: [0x00, 0xC9, 0x10, 0x02, 0x01, 0x01, 0x75, 0xD6],
  timestamp: [0x00, 0xC0, 0x10, 0x02, 0x00, 0x04, 0x38, 0xEF]
};

const state = {
  device: null,
  server: null,
  scpControl: null,
  battery: null,
  characteristics: [],
  notificationsEnabled: new Set(),
  latest: {
    batteryRaw: null,
    brightnessRaw: null,
    voltageRaw: null,
    telemetryRaw: null,
    timestampRaw: null
  }
};

const el = {};

function $(id) { return document.getElementById(id); }
function now() { return new Date().toLocaleTimeString("it-IT", { hour12: false }); }
function hex(value) {
  const bytes = value instanceof DataView
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(" ").toUpperCase();
}
function text(value) {
  return new TextDecoder().decode(value).replace(/\0/g, "").trim();
}
function log(kind, message) {
  const line = `[${now()}] [${kind}] ${message}`;
  el.bleLog.textContent = `${line}\n${el.bleLog.textContent}`.slice(0, 40000);
}
function setStatus(status) {
  const connected = status === "connected";
  const connecting = status === "connecting";
  el.connectionState.textContent = connected ? "Connesso" : connecting ? "Connessione…" : "Disconnesso";
  el.connectionState.className = connected ? "badge badge-success" : connecting ? "badge badge-warning" : "badge badge-secondary";
  el.btnConnect.disabled = connected || connecting;
  el.btnDisconnect.disabled = !connected;
  [el.btnReadInfo, el.btnReadBattery, el.btnReadBrightness, el.btnReadVoltage, el.btnReadTelemetry, el.btnReadDays, el.btnReadDiagnostics, el.btnCopyDiagnostics].forEach(button => {
    button.disabled = !connected;
  });
}
function reset() {
  state.server = null;
  state.scpControl = null;
  state.battery = null;
  state.characteristics = [];
  state.notificationsEnabled.clear();
  state.latest = { batteryRaw: null, brightnessRaw: null, voltageRaw: null, telemetryRaw: null, timestampRaw: null };
  el.deviceName.textContent = "–";
  el.batteryLevel.textContent = "–";
}

async function connect() {
  if (!navigator.bluetooth) {
    log("ERR", "Web Bluetooth non è disponibile in questo browser.");
    return;
  }
  try {
    setStatus("connecting");
    log("SYS", "Apertura selettore Bluetooth.");
    state.device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [IQOS_BLE.service, "device_information"]
    });
    state.device.addEventListener("gattserverdisconnected", onDisconnected);
    el.deviceName.textContent = state.device.name || "Dispositivo BLE";
    log("SYS", `Selezionato: ${state.device.name || state.device.id}`);
    state.server = await state.device.gatt.connect();
    await discover();
    setStatus("connected");
    await readInfo();
    await readBatteryRaw();
  } catch (error) {
    log("ERR", `${error.name || "Errore"}: ${error.message || error}`);
    reset();
    setStatus("disconnected");
  }
}

async function discover() {
  const services = await state.server.getPrimaryServices();
  log("GATT", `Servizi trovati: ${services.length}`);
  for (const service of services) {
    log("GATT", `Service ${service.uuid}`);
    const characteristics = await service.getCharacteristics();
    for (const characteristic of characteristics) {
      state.characteristics.push({ serviceUUID: service.uuid, characteristic });
      const p = characteristic.properties;
      const props = [p.read && "read", p.write && "write", p.writeWithoutResponse && "writeWithoutResponse", p.notify && "notify", p.indicate && "indicate"].filter(Boolean).join(", ");
      log("GATT", `  Char ${characteristic.uuid} [${props || "nessuna"}]`);
      if (characteristic.uuid === IQOS_BLE.scpControl) state.scpControl = characteristic;
      if (characteristic.uuid === IQOS_BLE.battery) state.battery = characteristic;
    }
  }
  if (!state.scpControl) throw new Error("Characteristic SCP control e16c6e20 non trovata.");
  if (!state.battery) log("WARN", "Characteristic batteria f8a54120 non trovata.");
  await subscribeIfPossible(state.scpControl);
  await subscribeIfPossible(state.battery);
}

async function subscribeIfPossible(characteristic) {
  if (!characteristic || (!characteristic.properties.notify && !characteristic.properties.indicate)) return;
  if (state.notificationsEnabled.has(characteristic.uuid)) return;
  characteristic.addEventListener("characteristicvaluechanged", event => {
    const source = event.target.uuid;
    const raw = hex(event.target.value);
    log("RX", `${source}: ${raw}`);
  });
  try {
    await characteristic.startNotifications();
    state.notificationsEnabled.add(characteristic.uuid);
    log("SYS", `Notifiche abilitate: ${characteristic.uuid}`);
  } catch (error) {
    log("WARN", `Notifiche non disponibili per ${characteristic.uuid}: ${error.message || error}`);
  }
}

async function readInfo() {
  const lines = [
    "=== IQOS Control — Info Dispositivo ===",
    `Data: ${new Date().toLocaleString("it-IT")}`,
    `Nome BLE: ${state.device?.name || "N/D"}`,
    ""
  ];
  for (const { characteristic } of state.characteristics) {
    if (!characteristic.properties.read) continue;
    try {
      const value = await characteristic.readValue();
      const raw = hex(value);
      const decoded = text(value);
      lines.push(`${characteristic.uuid}: ${raw}${decoded ? ` (${decoded})` : ""}`);
      log("READ", `${characteristic.uuid}: ${raw}`);
      if (characteristic.uuid === "00002a24-0000-1000-8000-00805f9b34fb" && decoded) el.deviceName.textContent = decoded;
    } catch (error) {
      log("WARN", `Read ${characteristic.uuid}: ${error.message || error}`);
    }
  }
  el.diagnosticsOutput.textContent = lines.join("\n");
}

async function readBatteryRaw() {
  if (!state.battery) return;
  try {
    const value = await state.battery.readValue();
    const raw = hex(value);
    state.latest.batteryRaw = raw;
    log("READ", `${state.battery.uuid}: ${raw}`);
    el.batteryLevel.textContent = "Raw disponibile";
  } catch (error) {
    log("ERR", `Lettura batteria: ${error.message || error}`);
  }
}

async function sendReadCommand(label, bytes, resultKey) {
  if (!state.scpControl) {
    log("ERR", "Canale SCP non disponibile.");
    return;
  }
  const packet = Uint8Array.from(bytes);
  log("TX", `${label}: ${hex(packet)}`);
  try {
    if (state.scpControl.properties.write) await state.scpControl.writeValueWithResponse(packet);
    else if (state.scpControl.properties.writeWithoutResponse) await state.scpControl.writeValueWithoutResponse(packet);
    else throw new Error("La characteristic SCP non è scrivibile.");
    state.latest[resultKey] = `TX ${hex(packet)}`;
    log("OK", `${label} inviato. Attendi eventuali RX nel log.`);
  } catch (error) {
    log("ERR", `${label}: ${error.message || error}`);
  }
}

async function refreshDiagnostics() {
  await readInfo();
  const gatt = state.characteristics.map(({ serviceUUID, characteristic }) => {
    const p = characteristic.properties;
    const props = [p.read && "read", p.write && "write", p.writeWithoutResponse && "writeWithoutResponse", p.notify && "notify", p.indicate && "indicate"].filter(Boolean).join(", ");
    return `${serviceUUID}\n  └─ ${characteristic.uuid} (${props || "nessuna"})`;
  });
  const diagnostics = [
    el.diagnosticsOutput.textContent,
    "",
    "=== Stato protocollare ===",
    `Battery raw (${IQOS_BLE.battery}): ${state.latest.batteryRaw || "N/D"}`,
    `Luminosità, ultimo comando: ${state.latest.brightnessRaw || "N/D"}`,
    `Tensione, ultimo comando: ${state.latest.voltageRaw || "N/D"}`,
    `Telemetria, ultimo comando: ${state.latest.telemetryRaw || "N/D"}`,
    `Giorni d’uso, ultimo comando: ${state.latest.timestampRaw || "N/D"}`,
    "",
    "=== GATT ===",
    ...gatt
  ].join("\n");
  el.diagnosticsOutput.textContent = diagnostics;
  log("INFO", "Diagnostica aggiornata.");
}

function onDisconnected() {
  reset();
  setStatus("disconnected");
  log("SYS", "Disconnesso.");
}
function disconnect() {
  if (state.device?.gatt?.connected) state.device.gatt.disconnect();
  else onDisconnected();
}
async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    log("SYS", `${label} copiato.`);
  } catch (error) {
    log("ERR", `Copia ${label}: ${error.message || error}`);
  }
}
function init() {
  Object.assign(el, {
    connectionState: $("connectionState"), deviceName: $("deviceName"), batteryLevel: $("batteryLevel"),
    diagnosticsOutput: $("diagnosticsOutput"), bleLog: $("bleLog"), btnConnect: $("btnConnect"), btnDisconnect: $("btnDisconnect"),
    btnReadInfo: $("btnReadInfo"), btnReadBattery: $("btnReadBattery"), btnReadBrightness: $("btnReadBrightness"),
    btnReadVoltage: $("btnReadVoltage"), btnReadTelemetry: $("btnReadTelemetry"), btnReadDays: $("btnReadDays"),
    btnReadDiagnostics: $("btnReadDiagnostics"), btnCopyDiagnostics: $("btnCopyDiagnostics"), btnCopyLog: $("btnCopyLog"), btnClearLog: $("btnClearLog")
  });
  el.btnConnect.addEventListener("click", connect);
  el.btnDisconnect.addEventListener("click", disconnect);
  el.btnReadInfo.addEventListener("click", readInfo);
  el.btnReadBattery.addEventListener("click", readBatteryRaw);
  el.btnReadBrightness.addEventListener("click", () => sendReadCommand("Leggi luminosità", COMMANDS.brightness, "brightnessRaw"));
  el.btnReadVoltage.addEventListener("click", () => sendReadCommand("Leggi tensione batteria", COMMANDS.batteryVoltage, "voltageRaw"));
  el.btnReadTelemetry.addEventListener("click", () => sendReadCommand("Leggi telemetria", COMMANDS.telemetry, "telemetryRaw"));
  el.btnReadDays.addEventListener("click", () => sendReadCommand("Leggi giorni d’uso", COMMANDS.timestamp, "timestampRaw"));
  el.btnReadDiagnostics.addEventListener("click", refreshDiagnostics);
  el.btnCopyDiagnostics.addEventListener("click", () => copy(el.diagnosticsOutput.textContent, "Diagnostica"));
  el.btnCopyLog.addEventListener("click", () => copy(el.bleLog.textContent, "Log"));
  el.btnClearLog.addEventListener("click", () => { el.bleLog.textContent = ""; });
  setStatus("disconnected");
  log("SYS", "IQOS Control Web avviato — build diagnostica read-only.");
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
