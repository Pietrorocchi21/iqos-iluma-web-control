"use strict";

const IQOS_BLE = {
    serviceUUID: "DAEBB240-B041-11E4-9E45-0002A5D5C51B",
    commandCharacteristicUUID: "04941060-B042-11E4-8BF6-0002A5D5C51B",
    notificationCharacteristicUUID: "E16C6E20-B041-11E4-A4C3-0002A5D5C51B",
    batteryCharUUID: "77F38A30-2B2C-489A-BE71-29E93A04A90A",
    statsCharUUID: "ECDFA4C0-B041-11E4-8B67-0002A5D5C51B",
};

const state = {
    device: null,
    server: null,
    characteristics: [],
    commandCharacteristic: null,
    notificationCharacteristic: null,
    batteryCharacteristic: null,
    statsCharacteristic: null,
    diagnosticsText: "",
};

let el = {};

function $(id) { return document.getElementById(id); }
function timestamp() { return new Date().toLocaleTimeString("it-IT", { hour12: false }); }
function log(kind, message) {
    if (!el.bleLog) return;
    el.bleLog.textContent = "[" + timestamp() + "] [" + kind + "] " + message + "\n" + el.bleLog.textContent;
}
function hex(value) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(" ").toUpperCase();
}
function setStatus(status) {
    const connected = status === "connected";
    el.connectionState.textContent = connected ? "Connesso" : status === "connecting" ? "Connessione..." : "Disconnesso";
    el.connectionState.className = connected ? "badge badge-success" : status === "connecting" ? "badge badge-warning" : "badge badge-secondary";
    el.btnConnect.disabled = connected;
    el.btnDisconnect.disabled = !connected;
    el.btnReadInfo.disabled = !connected;
    el.btnReadBattery.disabled = !connected;
    el.btnReadDiagnostics.disabled = !connected;
    el.btnCopyDiagnostics.disabled = !connected;
    el.btnCopyLog.disabled = !connected;
}

async function connect() {
    if (!navigator.bluetooth) {
        log("ERR", "Web Bluetooth non disponibile. Bluefy può fornire il bridge BLE su iOS.");
        return;
    }
    try {
        setStatus("connecting");
        log("SYS", "Apertura selettore Bluetooth.");
        state.device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [IQOS_BLE.serviceUUID, "0000180a-0000-1000-8000-00805f9b34fb"],
        });
        state.device.addEventListener("gattserverdisconnected", disconnect);
        el.deviceName.textContent = state.device.name || "Dispositivo BLE";
        state.server = await state.device.gatt.connect();
        log("SYS", "GATT connesso.");
        await discover();
        setStatus("connected");
        await enableNotifications();
        await readAllData();
    } catch (error) {
        log("ERR", error.name + ": " + error.message);
        state.server = null;
        setStatus("disconnected");
    }
}

async function discover() {
    state.characteristics = [];
    const services = await state.server.getPrimaryServices();
    for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const characteristic of characteristics) {
            state.characteristics.push({ service, characteristic });
            log("GATT", characteristic.uuid + " [" + Object.keys(characteristic.properties).filter(k => characteristic.properties[k]).join(", ") + "]");
            if (characteristic.uuid === IQOS_BLE.commandCharacteristicUUID) state.commandCharacteristic = characteristic;
            if (characteristic.uuid === IQOS_BLE.notificationCharacteristicUUID) state.notificationCharacteristic = characteristic;
            if (characteristic.uuid === IQOS_BLE.batteryCharUUID) state.batteryCharacteristic = characteristic;
            if (characteristic.uuid === IQOS_BLE.statsCharUUID) state.statsCharacteristic = characteristic;
        }
    }
}

async function enableNotifications() {
    const characteristic = state.notificationCharacteristic;
    if (!characteristic) return;
    if (!characteristic.properties.notify && !characteristic.properties.indicate) return;
    characteristic.addEventListener("characteristicvaluechanged", event => {
        const value = event.target.value;
        log("RX", event.target.uuid + ": " + hex(value));
    });
    try {
        await characteristic.startNotifications();
        log("SYS", "Notifiche abilitate: " + characteristic.uuid);
    } catch (error) {
        // Bluefy/iOS può rifiutare la sottoscrizione se manca o non viene esposto il CCCD.
        log("WARN", "Notifiche rifiutate: " + error.message + ". La lettura e la scrittura possono comunque funzionare.");
    }
}

async function readAllData() {
    for (const item of state.characteristics) {
        const c = item.characteristic;
        if (!c.properties.read) continue;
        try {
            const value = await c.readValue();
            const text = new TextDecoder().decode(value).replace(/\0/g, "");
            log("READ", c.uuid + ": " + hex(value) + (text ? " (" + text + ")" : ""));
            if (c.uuid === IQOS_BLE.batteryCharUUID && value.byteLength > 1) {
                const level = value.getUint8(1);
                el.batteryLevel.textContent = level + "%";
            }
        } catch (error) {
            log("WARN", "Read " + c.uuid + ": " + error.message);
        }
    }
}

async function readBattery() {
    if (!state.batteryCharacteristic) {
        log("ERR", "Characteristic batteria non trovata.");
        return;
    }
    try {
        const value = await state.batteryCharacteristic.readValue();
        log("READ", state.batteryCharacteristic.uuid + ": " + hex(value));
        if (value.byteLength > 1) el.batteryLevel.textContent = value.getUint8(1) + "%";
    } catch (error) {
        log("ERR", "Lettura batteria: " + error.message);
    }
}

function disconnect() {
    if (state.device && state.device.gatt && state.device.gatt.connected) state.device.gatt.disconnect();
    state.server = null;
    setStatus("disconnected");
    log("SYS", "Disconnesso.");
}

async function copyDiagnostics() {
    await navigator.clipboard.writeText(el.diagnosticsOutput.textContent);
    log("SYS", "Diagnostica copiata.");
}
async function copyLog() {
    const text = el.bleLog.textContent;
    await navigator.clipboard.writeText(text);
    log("SYS", "Log copiato.");
}

function init() {
    el = {
        connectionState: $("connectionState"), deviceName: $("deviceName"), batteryLevel: $("batteryLevel"), rssi: $("rssi"),
        diagnosticsOutput: $("diagnosticsOutput"), bleLog: $("bleLog"), btnConnect: $("btnConnect"), btnDisconnect: $("btnDisconnect"),
        btnReadInfo: $("btnReadInfo"), btnReadBattery: $("btnReadBattery"), btnReadDiagnostics: $("btnReadDiagnostics"),
        btnCopyDiagnostics: $("btnCopyDiagnostics"), btnCopyLog: $("btnCopyLog"), btnClearLog: $("btnClearLog"),
    };
    el.btnConnect.addEventListener("click", connect);
    el.btnDisconnect.addEventListener("click", disconnect);
    el.btnReadBattery.addEventListener("click", readBattery);
    el.btnCopyDiagnostics.addEventListener("click", copyDiagnostics);
    el.btnCopyLog.addEventListener("click", copyLog);
    el.btnClearLog.addEventListener("click", () => { el.bleLog.textContent = ""; });
    setStatus("disconnected");
    log("SYS", "IQOS Control Web avviato.");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
