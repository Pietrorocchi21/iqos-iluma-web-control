"use strict";

/*
 * IQOS Control Web
 * UUID Web Bluetooth devono essere minuscoli. Android Chrome rifiuta UUID 128-bit
 * espressi con lettere maiuscole in optionalServices.
 *
 * Questa build è volutamente READ-ONLY: non invia comandi proprietari non verificati.
 */

const IQOS_BLE = {
    serviceUUID: "daebb240-b041-11e4-9e45-0002a5d5c51b",
    commandCharacteristicUUID: "04941060-b042-11e4-8bf6-0002a5d5c51b",
    notificationCharacteristicUUID: "e16c6e20-b041-11e4-a4c3-0002a5d5c51b",
    batteryCharUUID: "77f38a30-2b2c-489a-be71-29e93a04a90a",
    statsCharUUID: "ecdfa4c0-b041-11e4-8b67-0002a5d5c51b",
};

const state = {
    device: null,
    server: null,
    characteristics: [],
    batteryCharacteristic: null,
    diagnosticsText: "Nessun dato diagnostico disponibile.",
};

let el = {};

function $(id) { return document.getElementById(id); }
function timestamp() { return new Date().toLocaleTimeString("it-IT", { hour12: false }); }
function log(kind, message) {
    if (!el.bleLog) return;
    const line = `[${timestamp()}] [${kind}] ${message}`;
    el.bleLog.textContent = `${line}\n${el.bleLog.textContent}`.slice(0, 30000);
}
function toHex(value) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join(" ").toUpperCase();
}
function toText(value) {
    return new TextDecoder().decode(value).replace(/\0/g, "");
}
function setStatus(status) {
    const connected = status === "connected";
    const connecting = status === "connecting";
    el.connectionState.textContent = connected ? "Connesso" : connecting ? "Connessione…" : "Disconnesso";
    el.connectionState.className = connected ? "badge badge-success" : connecting ? "badge badge-warning" : "badge badge-secondary";
    el.btnConnect.disabled = connected || connecting;
    el.btnDisconnect.disabled = !connected;
    el.btnReadInfo.disabled = !connected;
    el.btnReadBattery.disabled = !connected;
    el.btnReadDiagnostics.disabled = !connected;
    el.btnCopyDiagnostics.disabled = !connected;
    el.btnCopyLog.disabled = false;
}
function resetConnection() {
    state.server = null;
    state.characteristics = [];
    state.batteryCharacteristic = null;
    el.deviceName.textContent = "–";
    el.batteryLevel.textContent = "–";
    el.rssi.textContent = "–";
}

async function connect() {
    if (!navigator.bluetooth) {
        log("ERR", "Web Bluetooth non disponibile in questo browser.");
        return;
    }

    try {
        setStatus("connecting");
        log("SYS", "Apertura selettore Bluetooth.");
        state.device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [
                IQOS_BLE.serviceUUID,
                "device_information"
            ]
        });

        state.device.addEventListener("gattserverdisconnected", handleDisconnect);
        el.deviceName.textContent = state.device.name || "Dispositivo BLE";
        log("SYS", `Selezionato: ${state.device.name || state.device.id}`);

        state.server = await state.device.gatt.connect();
        log("SYS", "GATT connesso.");
        await discoverGatt();
        setStatus("connected");
        await readInfo();
    } catch (error) {
        log("ERR", `${error.name || "Errore"}: ${error.message || error}`);
        resetConnection();
        setStatus("disconnected");
    }
}

async function discoverGatt() {
    const services = await state.server.getPrimaryServices();
    state.characteristics = [];
    log("GATT", `Servizi trovati: ${services.length}`);

    for (const service of services) {
        log("GATT", `Service ${service.uuid}`);
        const characteristics = await service.getCharacteristics();
        for (const characteristic of characteristics) {
            state.characteristics.push({ serviceUUID: service.uuid, characteristic });
            const p = characteristic.properties;
            const props = [
                p.read && "read",
                p.write && "write",
                p.writeWithoutResponse && "writeWithoutResponse",
                p.notify && "notify",
                p.indicate && "indicate"
            ].filter(Boolean).join(", ");
            log("GATT", `  Char ${characteristic.uuid} [${props || "nessuna"}]`);
            if (characteristic.uuid === IQOS_BLE.batteryCharUUID) {
                state.batteryCharacteristic = characteristic;
            }
        }
    }
}

async function readInfo() {
    if (!state.server) return;
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
            const hex = toHex(value);
            const text = toText(value);
            lines.push(`${characteristic.uuid}: ${hex}${text ? ` (${text})` : ""}`);
            log("READ", `${characteristic.uuid}: ${hex}`);
            if (characteristic.uuid === "2a24" && text) {
                el.deviceName.textContent = text;
            }
        } catch (error) {
            log("WARN", `Read ${characteristic.uuid}: ${error.message || error}`);
        }
    }

    state.diagnosticsText = lines.join("\n");
    el.diagnosticsOutput.textContent = state.diagnosticsText;
}

async function readBattery() {
    if (!state.batteryCharacteristic) {
        log("WARN", "Characteristic candidata per batteria non trovata.");
        return;
    }
    try {
        const value = await state.batteryCharacteristic.readValue();
        const raw = toHex(value);
        log("READ", `${state.batteryCharacteristic.uuid}: ${raw}`);
        // Il significato dei byte non è ancora validato: mostra il valore raw,
        // senza dichiarare una percentuale non verificata.
        el.batteryLevel.textContent = "Dati disponibili";
        el.diagnosticsOutput.textContent = `${state.diagnosticsText}\n\nBatteria raw (${state.batteryCharacteristic.uuid}): ${raw}\nInterpretazione percentuale: non verificata.`;
    } catch (error) {
        log("ERR", `Lettura batteria: ${error.message || error}`);
    }
}

async function readDiagnostics() {
    await readInfo();
    const gatt = state.characteristics.map(({ serviceUUID, characteristic }) => {
        const p = characteristic.properties;
        const props = [p.read && "read", p.write && "write", p.writeWithoutResponse && "writeWithoutResponse", p.notify && "notify", p.indicate && "indicate"].filter(Boolean).join(", ");
        return `${serviceUUID}\n  └─ ${characteristic.uuid} (${props || "nessuna"})`;
    });
    state.diagnosticsText += `\n\n=== GATT ===\n${gatt.join("\n")}`;
    el.diagnosticsOutput.textContent = state.diagnosticsText;
    log("INFO", "Diagnostica aggiornata.");
}

function handleDisconnect() {
    resetConnection();
    setStatus("disconnected");
    log("SYS", "Disconnesso.");
}
function disconnect() {
    if (state.device?.gatt?.connected) state.device.gatt.disconnect();
    else handleDisconnect();
}
async function copyText(text, label) {
    try {
        await navigator.clipboard.writeText(text);
        log("SYS", `${label} copiato.`);
    } catch (error) {
        log("ERR", `Copia ${label}: ${error.message || error}`);
    }
}
function init() {
    el = {
        connectionState: $("connectionState"), deviceName: $("deviceName"), batteryLevel: $("batteryLevel"), rssi: $("rssi"),
        diagnosticsOutput: $("diagnosticsOutput"), bleLog: $("bleLog"), btnConnect: $("btnConnect"), btnDisconnect: $("btnDisconnect"),
        btnReadInfo: $("btnReadInfo"), btnReadBattery: $("btnReadBattery"), btnReadDiagnostics: $("btnReadDiagnostics"),
        btnCopyDiagnostics: $("btnCopyDiagnostics"), btnCopyLog: $("btnCopyLog"), btnClearLog: $("btnClearLog")
    };
    el.btnConnect.addEventListener("click", connect);
    el.btnDisconnect.addEventListener("click", disconnect);
    el.btnReadInfo.addEventListener("click", readInfo);
    el.btnReadBattery.addEventListener("click", readBattery);
    el.btnReadDiagnostics.addEventListener("click", readDiagnostics);
    el.btnCopyDiagnostics.addEventListener("click", () => copyText(el.diagnosticsOutput.textContent, "Diagnostica"));
    el.btnCopyLog.addEventListener("click", () => copyText(el.bleLog.textContent, "Log"));
    el.btnClearLog.addEventListener("click", () => { el.bleLog.textContent = ""; });
    setStatus("disconnected");
    log("SYS", "IQOS Control Web avviato.");
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
