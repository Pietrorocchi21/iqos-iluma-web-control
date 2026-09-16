"use strict";

const IQOS_BLE = {
    serviceUUID: "DAEBB240-B041-11E4-9E45-0002A5D5C51B",
    commandCharacteristicUUID: "04941060-B042-11E4-8BF6-0002A5D5C51B",
    notificationCharacteristicUUID: "E16C6E20-B041-11E4-A4C3-0002A5D5C51B",
    batteryCharUUID: "77F38A30-2B2C-489A-BE71-29E93A04A90A",
    statsCharUUID: "ECDFA4C0-B041-11E4-8B67-0002A5D5C51B",
};

const IQOS_CMD = {
    READ_DEVICE_INFO: 0x10,
    READ_BATTERY: 0x11,
    READ_DIAGNOSTIC: 0x12,
    SET_BRIGHTNESS: 0x20,
    SET_VIBRATION: 0x21,
    SET_AUTOSTART: 0x30,
    SET_SMART_GESTURE: 0x31,
    SET_FLEXPUFF: 0x40,
    SET_FLEXBATTERY: 0x41,
    SET_PAUSE_MODE: 0x42,
    FIND_MY_IQOS: 0x50,
    LOCK_DEVICE: 0x60,
    UNLOCK_DEVICE: 0x61,
};

const state = {
    device: null,
    server: null,
    services: [],
    characteristics: [],
    commandCharacteristic: null,
    notificationCharacteristic: null,
    batteryCharacteristic: null,
    statsCharacteristic: null,
    deviceInfo: {
        name: null,
        model: null,
        serial: null,
        manufacturer: null,
        batteryPercent: null,
        puffCount: null,
    },
    diagnosticsText: "",
};

let el = null;

function initElements() {
    el = {
        connectionState: document.querySelector("#connectionState"),
        deviceName: document.querySelector("#deviceName"),
        batteryLevel: document.querySelector("#batteryLevel"),
        rssi: document.querySelector("#rssi"),
        diagnosticsOutput: document.querySelector("#diagnosticsOutput"),
        bleLog: document.querySelector("#bleLog"),
        btnConnect: document.querySelector("#btnConnect"),
        btnDisconnect: document.querySelector("#btnDisconnect"),
        btnReadInfo: document.querySelector("#btnReadInfo"),
        btnReadBattery: document.querySelector("#btnReadBattery"),
        btnReadDiagnostics: document.querySelector("#btnReadDiagnostics"),
        brightnessSelect: document.querySelector("#brightnessSelect"),
        btnSetBrightness: document.querySelector("#btnSetBrightness"),
        vibrationToggle: document.querySelector("#vibrationToggle"),
        btnSetVibration: document.querySelector("#btnSetVibration"),
        btnCopyDiagnostics: document.querySelector("#btnCopyDiagnostics"),
        btnCopyLog: document.querySelector("#btnCopyLog"),
        btnClearLog: document.querySelector("#btnClearLog"),
        autoStartToggle: document.querySelector("#autoStartToggle"),
        btnSetAutoStart: document.querySelector("#btnSetAutoStart"),
        smartGestureToggle: document.querySelector("#smartGestureToggle"),
        btnSetSmartGesture: document.querySelector("#btnSetSmartGesture"),
        flexPuffToggle: document.querySelector("#flexPuffToggle"),
        btnSetFlexPuff: document.querySelector("#btnSetFlexPuff"),
        flexBatteryToggle: document.querySelector("#flexBatteryToggle"),
        btnSetFlexBattery: document.querySelector("#btnSetFlexBattery"),
        pauseModeToggle: document.querySelector("#pauseModeToggle"),
        btnSetPauseMode: document.querySelector("#btnSetPauseMode"),
        btnFindMyIQOS: document.querySelector("#btnFindMyIQOS"),
        btnLockDevice: document.querySelector("#btnLockDevice"),
        btnUnlockDevice: document.querySelector("#btnUnlockDevice"),
    };
}

function timestamp() {
    return new Date().toLocaleTimeString("it-IT", { hour12: false });
}

function appendLog(kind, message) {
    if (!el || !el.bleLog) return;
    const line = "[" + timestamp() + "] [" + kind + "] " + message;
    el.bleLog.textContent = (line + "\n" + el.bleLog.textContent).slice(0, 30000);
}

function dataToHex(dataView) {
    const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    return Array.from(bytes, function(byte) { return byte.toString(16).padStart(2, "0"); }).join(" ").toUpperCase();
}

function dataToString(dataView) {
    const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    return new TextDecoder().decode(bytes).replace(/\0/g, "");
}

function setConnectionState(status) {
    if (!el) return;
    
    var config;
    if (status === "disconnected") {
        config = { text: "Disconnesso", className: "badge badge-secondary" };
    } else if (status === "connecting") {
        config = { text: "Connessione...", className: "badge badge-warning" };
    } else {
        config = { text: "Connesso", className: "badge badge-success" };
    }

    el.connectionState.textContent = config.text;
    el.connectionState.className = config.className;

    var connected = (status === "connected");
    if (el.btnConnect) el.btnConnect.disabled = connected;
    if (el.btnDisconnect) el.btnDisconnect.disabled = !connected;
    if (el.btnReadInfo) el.btnReadInfo.disabled = !connected;
    if (el.btnReadBattery) el.btnReadBattery.disabled = !connected;
    if (el.btnReadDiagnostics) el.btnReadDiagnostics.disabled = !connected;
    if (el.brightnessSelect) el.brightnessSelect.disabled = !connected;
    if (el.btnSetBrightness) el.btnSetBrightness.disabled = !connected;
    if (el.vibrationToggle) el.vibrationToggle.disabled = !connected;
    if (el.btnSetVibration) el.btnSetVibration.disabled = !connected;
    if (el.btnCopyDiagnostics) el.btnCopyDiagnostics.disabled = !connected;
    if (el.btnCopyLog) el.btnCopyLog.disabled = !connected;
    if (el.autoStartToggle) el.autoStartToggle.disabled = !connected;
    if (el.btnSetAutoStart) el.btnSetAutoStart.disabled = !connected;
    if (el.smartGestureToggle) el.smartGestureToggle.disabled = !connected;
    if (el.btnSetSmartGesture) el.btnSetSmartGesture.disabled = !connected;
    if (el.flexPuffToggle) el.flexPuffToggle.disabled = !connected;
    if (el.btnSetFlexPuff) el.btnSetFlexPuff.disabled = !connected;
    if (el.flexBatteryToggle) el.flexBatteryToggle.disabled = !connected;
    if (el.btnSetFlexBattery) el.btnSetFlexBattery.disabled = !connected;
    if (el.pauseModeToggle) el.pauseModeToggle.disabled = !connected;
    if (el.btnSetPauseMode) el.btnSetPauseMode.disabled = !connected;
    if (el.btnFindMyIQOS) el.btnFindMyIQOS.disabled = !connected;
    if (el.btnLockDevice) el.btnLockDevice.disabled = !connected;
    if (el.btnUnlockDevice) el.btnUnlockDevice.disabled = !connected;
}

function resetDeviceState() {
    state.server = null;
    state.services = [];
    state.characteristics = [];
    state.commandCharacteristic = null;
    state.notificationCharacteristic = null;
    state.batteryCharacteristic = null;
    state.statsCharacteristic = null;
    state.deviceInfo = { name: null, model: null, serial: null, manufacturer: null, batteryPercent: null, puffCount: null };
    if (el) {
        el.deviceName.textContent = "–";
        el.batteryLevel.textContent = "–";
        el.rssi.textContent = "–";
    }
}

function bluetoothAvailable() {
    if (!navigator.bluetooth) {
        alert("Web Bluetooth non disponibile. Usa Chrome/Edge desktop/Android.");
        appendLog("ERR", "Web Bluetooth non supportato.");
        return false;
    }
    return true;
}

async function connect() {
    if (!bluetoothAvailable()) return;

    try {
        setConnectionState("connecting");
        appendLog("SYS", "Apertura selettore Bluetooth.");

        var options = {
            acceptAllDevices: true,
            optionalServices: [IQOS_BLE.serviceUUID, "0000180a-0000-1000-8000-00805f9b34fb"],
        };

        state.device = await navigator.bluetooth.requestDevice(options);
        state.device.addEventListener("gattserverdisconnected", onDisconnected);
        el.deviceName.textContent = state.device.name || "Dispositivo BLE";
        appendLog("SYS", "Selezionato: " + (state.device.name || state.device.id));

        state.server = await state.device.gatt.connect();
        appendLog("SYS", "GATT connesso.");

        await discoverGatt();
        setConnectionState("connected");
        
        if (state.notificationCharacteristic) {
            await enableNotifications(state.notificationCharacteristic);
        }

        setTimeout(readAllData, 800);
    } catch (error) {
        appendLog("ERR", error.message || String(error));
        resetDeviceState();
        setConnectionState("disconnected");
    }
}

async function discoverGatt() {
    if (!state.server) return;

    var services = await state.server.getPrimaryServices();
    state.services = services;
    appendLog("GATT", "Servizi trovati: " + services.length);

    for (var i = 0; i < services.length; i++) {
        var service = services[i];
        appendLog("GATT", "Service " + service.uuid);
        var characteristics = await service.getCharacteristics();

        for (var j = 0; j < characteristics.length; j++) {
            var characteristic = characteristics[j];
            state.characteristics.push({ serviceUUID: service.uuid, characteristic: characteristic });
            var p = characteristic.properties;
            var properties = [p.read && "read", p.write && "write", p.writeWithoutResponse && "writeWithoutResponse", p.notify && "notify", p.indicate && "indicate"].filter(Boolean).join(", ");
            appendLog("GATT", "  Char " + characteristic.uuid + " [" + (properties || "nessuna") + "]");

            if (characteristic.uuid === IQOS_BLE.commandCharacteristicUUID) {
                state.commandCharacteristic = characteristic;
                appendLog("INFO", "✓ Comandi: " + characteristic.uuid);
            }

            if (characteristic.uuid === IQOS_BLE.notificationCharacteristicUUID) {
                state.notificationCharacteristic = characteristic;
                appendLog("INFO", "✓ Notifiche: " + characteristic.uuid);
            }

            if (characteristic.uuid === IQOS_BLE.batteryCharUUID) {
                state.batteryCharacteristic = characteristic;
                appendLog("INFO", "✓ Batteria: " + characteristic.uuid);
            }

            if (characteristic.uuid === IQOS_BLE.statsCharUUID) {
                state.statsCharacteristic = characteristic;
                appendLog("INFO", "✓ Stats: " + characteristic.uuid);
            }
        }
    }
}

async function enableNotifications(characteristic) {
    if (!characteristic.properties.notify && !characteristic.properties.indicate) return;
    characteristic.addEventListener("characteristicvaluechanged", onNotification);
    await characteristic.startNotifications();
    appendLog("SYS", "Notifiche abilitate: " + characteristic.uuid);
}

function onNotification(event) {
    var characteristic = event.target;
    var value = characteristic.value;
    appendLog("RX", characteristic.uuid + ": " + dataToHex(value));
    parseIQOSResponse(value);
}

function parseIQOSResponse(data) {
    var bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (bytes.length < 2) return;

    if (bytes[0] === 0x11 && bytes.length >= 2) {
        var batteryPercent = bytes[1];
        state.deviceInfo.batteryPercent = batteryPercent;
        el.batteryLevel.textContent = batteryPercent + "%";
        appendLog("INFO", "Batteria: " + batteryPercent + "%");
    }

    if (bytes[0] === 0x12 && bytes.length >= 6) {
        var batteryPercent = bytes[1];
        var puffCount = (bytes[2] << 24) | (bytes[3] << 16) | (bytes[4] << 8) | bytes[5];
        state.deviceInfo.batteryPercent = batteryPercent;
        state.deviceInfo.puffCount = puffCount;
        el.batteryLevel.textContent = batteryPercent + "%";
        appendLog("INFO", "Batteria: " + batteryPercent + "%, Puff: " + puffCount);
    }
}

function onDisconnected() {
    appendLog("SYS", "Disconnesso.");
    resetDeviceState();
    setConnectionState("disconnected");
}

function disconnect() {
    if (state.device && state.device.gatt && state.device.gatt.connected) {
        state.device.gatt.disconnect();
    } else {
        onDisconnected();
    }
}

async function readAllData() {
    appendLog("CMD", "Lettura tutti i dati...");

    for (var i = 0; i < state.characteristics.length; i++) {
        var item = state.characteristics[i];
        var characteristic = item.characteristic;
        if (characteristic.properties.read) {
            try {
                var value = await characteristic.readValue();
                var hex = dataToHex(value);
                var text = dataToString(value);
                var bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
                
                if (characteristic.uuid === "2A24") {
                    state.deviceInfo.name = text;
                    el.deviceName.textContent = text;
                    appendLog("INFO", "Device Name: " + text);
                } else if (characteristic.uuid === "2A28") {
                    state.deviceInfo.model = text;
                    appendLog("INFO", "Model: " + text);
                } else if (characteristic.uuid === "2A25") {
                    state.deviceInfo.serial = text;
                    appendLog("INFO", "Serial: " + text);
                } else if (characteristic.uuid === "2A29") {
                    state.deviceInfo.manufacturer = text;
                    appendLog("INFO", "Manufacturer: " + text);
                } else if (characteristic.uuid === IQOS_BLE.batteryCharUUID) {
                    var batteryPercent = bytes[1];
                    state.deviceInfo.batteryPercent = batteryPercent;
                    el.batteryLevel.textContent = batteryPercent + "%";
                    appendLog("INFO", "Batteria (77F38A30): " + batteryPercent + "% (" + hex + ")");
                } else if (characteristic.uuid === IQOS_BLE.statsCharUUID) {
                    var puffCount = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
                    state.deviceInfo.puffCount = puffCount;
                    appendLog("INFO", "Puff Count (ECDFA4C0): " + puffCount + " (" + hex + ")");
                }
            } catch (e) {
                appendLog("WARN", characteristic.uuid + ": " + e.message);
            }
        }
    }
}

async function readDeviceInfo() {
    appendLog("CMD", "Lettura info...");
    await readAllData();
    await writeCommand([IQOS_CMD.READ_DEVICE_INFO, 0x00], "Read Device Info");
}

async function readBattery() {
    appendLog("CMD", "Lettura batteria...");
    
    if (state.batteryCharacteristic && state.batteryCharacteristic.properties.read) {
        try {
            var value = await state.batteryCharacteristic.readValue();
            var bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
            var batteryPercent = bytes[1];
            state.deviceInfo.batteryPercent = batteryPercent;
            el.batteryLevel.textContent = batteryPercent + "%";
            appendLog("INFO", "Batteria: " + batteryPercent + "%");
        } catch (e) {
            appendLog("ERR", "Lettura batteria fallita: " + e.message);
        }
    }
    
    await writeCommand([IQOS_CMD.READ_BATTERY, 0x00], "Read Battery");
}

async function readDiagnostics() {
    appendLog("CMD", "Lettura diagnostica...");
    await writeCommand([IQOS_CMD.READ_DIAGNOSTIC, 0x00], "Read Diagnostic");

    var characteristicLines = [];
    for (var i = 0; i < state.characteristics.length; i++) {
        var item = state.characteristics[i];
        var p = item.characteristic.properties;
        var capabilities = [p.read && "read", p.write && "write", p.writeWithoutResponse && "writeWithoutResponse", p.notify && "notify", p.indicate && "indicate"].filter(Boolean).join(", ");
        characteristicLines.push(item.serviceUUID + "\n  └─ " + item.characteristic.uuid + " (" + (capabilities || "nessuna") + ")");
    }

    state.diagnosticsText = [
        "=== IQOS Control — Diagnostica ===",
        "Data: " + new Date().toLocaleString("it-IT"),
        "Dispositivo: " + (state.device.name || "N/D"),
        "Stato: " + (state.device.gatt && state.device.gatt.connected ? "Connesso" : "Disconnesso"),
        "",
        "=== UUID IQOS ===",
        "Servizio: " + IQOS_BLE.serviceUUID,
        "Comandi: " + IQOS_BLE.commandCharacteristicUUID,
        "Notifiche: " + IQOS_BLE.notificationCharacteristicUUID,
        "",
        "=== Info Dispositivo ===",
        "Nome: " + (state.deviceInfo.name || "N/D"),
        "Modello: " + (state.deviceInfo.model || "N/D"),
        "Seriale: " + (state.deviceInfo.serial || "N/D"),
        "Manufacturer: " + (state.deviceInfo.manufacturer || "N/D"),
        "Batteria: " + (state.deviceInfo.batteryPercent !== null ? state.deviceInfo.batteryPercent + "%" : "N/D"),
        "Puff Count: " + (state.deviceInfo.puffCount !== null ? state.deviceInfo.puffCount : "N/D"),
        "",
        "=== GATT ===",
    ].concat(characteristicLines).join("\n");

    el.diagnosticsOutput.textContent = state.diagnosticsText;
}

async function writeCommand(bytes, description) {
    if (!state.commandCharacteristic) {
        appendLog("ERR", "Characteristic comandi non trovata.");
        return;
    }

    var data = Uint8Array.from(bytes);
    var hexStr = Array.from(data, function(b) { return b.toString(16).padStart(2, "0"); }).join(" ").toUpperCase();
    appendLog("TX", description + ": " + hexStr);

    try {
        if (state.commandCharacteristic.properties.write) {
            await state.commandCharacteristic.writeValueWithResponse(data);
        } else if (state.commandCharacteristic.properties.writeWithoutResponse) {
            await state.commandCharacteristic.writeValueWithoutResponse(data);
        }
        appendLog("OK", description + " inviato.");
    } catch (error) {
        appendLog("ERR", description + " fallito: " + error.message);
    }
}

async function setBrightness() {
    var level = parseInt(el.brightnessSelect.value, 10);
    appendLog("CMD", "Brightness: " + level);
    await writeCommand([IQOS_CMD.SET_BRIGHTNESS, level], "Set Brightness");
}

async function setVibration() {
    var enabled = el.vibrationToggle.checked ? 0x01 : 0x00;
    appendLog("CMD", "Vibration: " + (enabled ? "ON" : "OFF"));
    await writeCommand([IQOS_CMD.SET_VIBRATION, enabled], "Set Vibration");
}

async function setAutoStart() {
    var enabled = el.autoStartToggle.checked ? 0x01 : 0x00;
    appendLog("CMD", "AutoStart: " + (enabled ? "ON" : "OFF"));
    await writeCommand([IQOS_CMD.SET_AUTOSTART, enabled], "Set AutoStart");
}

async function setSmartGesture() {
    var enabled = el.smartGestureToggle.checked ? 0x01 : 0x00;
    appendLog("CMD", "Smart Gesture: " + (enabled ? "ON" : "OFF"));
    await writeCommand([IQOS_CMD.SET_SMART_GESTURE, enabled], "Set Smart Gesture");
}

async function setFlexPuff() {
    var enabled = el.flexPuffToggle.checked ? 0x01 : 0x00;
    appendLog("CMD", "FlexPuff: " + (enabled ? "ON" : "OFF"));
    await writeCommand([IQOS_CMD.SET_FLEXPUFF, enabled], "Set FlexPuff");
}

async function setFlexBattery() {
    var enabled = el.flexBatteryToggle.checked ? 0x01 : 0x00;
    appendLog("CMD", "FlexBattery: " + (enabled ? "ON" : "OFF"));
    await writeCommand([IQOS_CMD.SET_FLEXBATTERY, enabled], "Set FlexBattery");
}

async function setPauseMode() {
    var enabled = el.pauseModeToggle.checked ? 0x01 : 0x00;
    appendLog("CMD", "Pause Mode: " + (enabled ? "ON" : "OFF"));
    await writeCommand([IQOS_CMD.SET_PAUSE_MODE, enabled], "Set Pause Mode");
}

async function findMyIQOS() {
    appendLog("CMD", "Find My IQOS");
    await writeCommand([IQOS_CMD.FIND_MY_IQOS, 0x00], "Find My IQOS");
}

async function lockDevice() {
    appendLog("CMD", "Lock Device");
    await writeCommand([IQOS_CMD.LOCK_DEVICE, 0x00], "Lock Device");
}

async function unlockDevice() {
    appendLog("CMD", "Unlock Device");
    await writeCommand([IQOS_CMD.UNLOCK_DEVICE, 0x00], "Unlock Device");
}

async function copyDiagnostics() {
    try {
        await navigator.clipboard.writeText(state.diagnosticsText);
        appendLog("SYS", "Diagnostica copiata.");
        alert("✓ Diagnostica copiata!");
    } catch (error) {
        appendLog("ERR", "Errore: " + error.message);
    }
}

async function copyLog() {
    try {
        var logText = el.bleLog.textContent;
        await navigator.clipboard.writeText(logText);
        appendLog("SYS", "Log copiato.");
        alert("✓ Log BLE copiato!");
    } catch (error) {
        appendLog("ERR", "Errore: " + error.message);
    }
}

// Inizializza quando il DOM è pronto
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAndStart);
} else {
    initAndStart();
}

function initAndStart() {
    initElements();
    
    // Event listeners
    el.btnConnect.addEventListener("click", connect);
    el.btnDisconnect.addEventListener("click", disconnect);
    el.btnReadInfo.addEventListener("click", readDeviceInfo);
    el.btnReadBattery.addEventListener("click", readBattery);
    el.btnReadDiagnostics.addEventListener("click", readDiagnostics);
    el.btnSetBrightness.addEventListener("click", setBrightness);
    el.btnSetVibration.addEventListener("click", setVibration);
    el.btnSetAutoStart.addEventListener("click", setAutoStart);
    el.btnSetSmartGesture.addEventListener("click", setSmartGesture);
    el.btnSetFlexPuff.addEventListener("click", setFlexPuff);
    el.btnSetFlexBattery.addEventListener("click", setFlexBattery);
    el.btnSetPauseMode.addEventListener("click", setPauseMode);
    el.btnFindMyIQOS.addEventListener("click", findMyIQOS);
    el.btnLockDevice.addEventListener("click", lockDevice);
    el.btnUnlockDevice.addEventListener("click", unlockDevice);
    el.btnCopyDiagnostics.addEventListener("click", copyDiagnostics);
    el.btnCopyLog.addEventListener("click", copyLog);
    el.btnClearLog.addEventListener("click", function() { el.bleLog.textContent = ""; });

    setConnectionState("disconnected");
    appendLog("SYS", "IQOS Control Web avviato.");
    appendLog("INFO", "Servizio: " + IQOS_BLE.serviceUUID);
    appendLog("INFO", "Comandi: " + IQOS_BLE.commandCharacteristicUUID);
    appendLog("INFO", "Notifiche: " + IQOS_BLE.notificationCharacteristicUUID);
}
