"use strict";

const IQOS_BLE = {
    serviceUUID: "DAEBB240-B041-11E4-9E45-0002A5D5C51B",
    commandCharacteristicUUID: "04941060-B042-11E4-8BF6-0002A5D5C51B",
    notificationCharacteristicUUID: "E16C6E20-B041-11E4-A4C3-0002A5D5C51B",
    batteryCharUUID: "77F38A30-2B2C-489A-BE71-29E93A04A90A",
    statsCharUUID: "ECDFA4C0-B041-11E4-8B67-0002A5D5C51B",
    configCharUUID: "0AFF6F80-B042-11E4-9B66-0002A5D5C51B",
    statusCharUUID: "F8A54120-B041-11E4-9BE7-0002A5D5C51B",
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
        batteryVoltage: null,
        puffCount: null,
        usageDays: null,
    },
    diagnosticsText: "",
};

const el = {
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

function timestamp() {
    return new Date().toLocaleTimeString("it-IT", { hour12: false });
}

function appendLog(kind, message) {
    const line = `[${timestamp()}] [${kind}] ${message}`;
    el.bleLog.textContent = `${line}\n${el.bleLog.textContent}`.slice(0, 30000);
}

function dataToHex(dataView) {
    const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join(" ").toUpperCase();
}

function dataToString(dataView) {
    const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    return new TextDecoder().decode(bytes).replace(/\0/g, "");
}

function setConnectionState(status) {
    const config = {
        disconnected: { text: "Disconnesso", className: "badge badge-secondary" },
        connecting: { text: "Connessione…", className: "badge badge-warning" },
        connected: { text: "Connesso", className: "badge badge-success" },
    }[status];

    el.connectionState.textContent = config.text;
    el.connectionState.className = config.className;

    const connected = status === "connected";
    el.btnConnect.disabled = connected;
    el.btnDisconnect.disabled = !connected;
    el.btnReadInfo.disabled = !connected;
    el.btnReadBattery.disabled = !connected;
    el.btnReadDiagnostics.disabled = !connected;
    el.brightnessSelect.disabled = !connected;
    el.btnSetBrightness.disabled = !connected;
    el.vibrationToggle.disabled = !connected;
    el.btnSetVibration.disabled = !connected;
    el.btnCopyDiagnostics.disabled = !connected;
    el.btnCopyLog.disabled = !connected;
    el.autoStartToggle.disabled = !connected;
    el.btnSetAutoStart.disabled = !connected;
    el.smartGestureToggle.disabled = !connected;
    el.btnSetSmartGesture.disabled = !connected;
    el.flexPuffToggle.disabled = !connected;
    el.btnSetFlexPuff.disabled = !connected;
    el.flexBatteryToggle.disabled = !connected;
    el.btnSetFlexBattery.disabled = !connected;
    el.pauseModeToggle.disabled = !connected;
    el.btnSetPauseMode.disabled = !connected;
    el.btnFindMyIQOS.disabled = !connected;
    el.btnLockDevice.disabled = !connected;
    el.btnUnlockDevice.disabled = !connected;
}

function resetDeviceState() {
    state.server = null;
    state.services = [];
    state.characteristics = [];
    state.commandCharacteristic = null;
    state.notificationCharacteristic = null;
    state.batteryCharacteristic = null;
    state.statsCharacteristic = null;
    state.deviceInfo = { name: null, model: null, serial: null, manufacturer: null, batteryPercent: null, batteryVoltage: null, puffCount: null, usageDays: null };
    el.deviceName.textContent = "–";
    el.batteryLevel.textContent = "–";
    el.rssi.textContent = "–";
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

        const options = {
            acceptAllDevices: true,
            optionalServices: [IQOS_BLE.serviceUUID, "0000180a-0000-1000-8000-00805f9b34fb"],
        };

        state.device = await navigator.bluetooth.requestDevice(options);
        state.device.addEventListener("gattserverdisconnected", onDisconnected);
        el.deviceName.textContent = state.device.name || "Dispositivo BLE";
        appendLog("SYS", `Selezionato: ${state.device.name || state.device.id}`);

        state.server = await state.device.gatt.connect();
        appendLog("SYS", "GATT connesso.");

        await discoverGatt();
        setConnectionState("connected");
        
        if (state.notificationCharacteristic) {
            await enableNotifications(state.notificationCharacteristic);
        }

        setTimeout(readAllData, 500);
    } catch (error) {
        appendLog("ERR", error.message || String(error));
        resetDeviceState();
        setConnectionState("disconnected");
    }
}

async function discoverGatt() {
    if (!state.server) return;

    const services = await state.server.getPrimaryServices();
    state.services = services;
    appendLog("GATT", `Servizi trovati: ${services.length}`);

    for (const service of services) {
        appendLog("GATT", `Service ${service.uuid}`);
        const characteristics = await service.getCharacteristics();

        for (const characteristic of characteristics) {
            state.characteristics.push({ serviceUUID: service.uuid, characteristic });
            const p = characteristic.properties;
            const properties = [p.read && "read", p.write && "write", p.writeWithoutResponse && "writeWithoutResponse", p.notify && "notify", p.indicate && "indicate"].filter(Boolean).join(", ");
            appendLog("GATT", `  Char ${characteristic.uuid} [${properties || "nessuna"}]`);

            if (characteristic.uuid === IQOS_BLE.commandCharacteristicUUID) {
                state.commandCharacteristic = characteristic;
                appendLog("INFO", `✓ Comandi: ${characteristic.uuid}`);
            }

            if (characteristic.uuid === IQOS_BLE.notificationCharacteristicUUID) {
                state.notificationCharacteristic = characteristic;
                appendLog("INFO", `✓ Notifiche: ${characteristic.uuid}`);
            }

            if (characteristic.uuid === IQOS_BLE.batteryCharUUID) {
                state.batteryCharacteristic = characteristic;
                appendLog("INFO", `✓ Batteria: ${characteristic.uuid}`);
            }

            if (characteristic.uuid === IQOS_BLE.statsCharUUID) {
                state.statsCharacteristic = characteristic;
                appendLog("INFO", `✓ Stats: ${characteristic.uuid}`);
            }
        }
    }
}

async function enableNotifications(characteristic) {
    if (!characteristic.properties.notify && !characteristic.properties.indicate) return;
    characteristic.addEventListener("characteristicvaluechanged", onNotification);
    await characteristic.startNotifications();
    appendLog("SYS", `Notifiche abilitate: ${characteristic.uuid}`);
}

function onNotification(event) {
    const characteristic = event.target;
    const value = characteristic.value;
    appendLog("RX", `${characteristic.uuid}: ${dataToHex(value)}`);
    parseIQOSResponse(value);
}

function parseIQOSResponse(data) {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (bytes.length < 2) return;

    if (bytes[0] === 0x11 && bytes.length >= 2) {
        const batteryPercent = bytes[1];
        state.deviceInfo.batteryPercent = batteryPercent;
        el.batteryLevel.textContent = `${batteryPercent}%`;
        appendLog("INFO", `Batteria: ${batteryPercent}%`);
    }

    if (bytes[0] === 0x12 && bytes.length >= 6) {
        const batteryPercent = bytes[1];
        const puffCount = (bytes[2] << 24) | (bytes[3] << 16) | (bytes[4] << 8) | bytes[5];
        state.deviceInfo.batteryPercent = batteryPercent;
        state.deviceInfo.puffCount = puffCount;
        el.batteryLevel.textContent = `${batteryPercent}%`;
        appendLog("INFO", `Batteria: ${batteryPercent}%, Puff: ${puffCount}`);
    }
}

function onDisconnected() {
    appendLog("SYS", "Disconnesso.");
    resetDeviceState();
    setConnectionState("disconnected");
}

function disconnect() {
    if (state.device?.gatt?.connected) {
        state.device.gatt.disconnect();
    } else {
        onDisconnected();
    }
}

async function readAllData() {
    appendLog("CMD", "Lettura tutti i dati...");

    for (const { characteristic } of state.characteristics) {
        if (characteristic.properties.read) {
            try {
                const value = await characteristic.readValue();
                const hex = dataToHex(value);
                const text = dataToString(value);
                
                if (characteristic.uuid === "2A24") {
                    state.deviceInfo.name = text;
                    el.deviceName.textContent = text;
                    appendLog("INFO", `Device Name: ${text}`);
                } else if (characteristic.uuid === "2A28") {
                    state.deviceInfo.model = text;
                    appendLog("INFO", `Model: ${text}`);
                } else if (characteristic.uuid === "2A25") {
                    state.deviceInfo.serial = text;
                    appendLog("INFO", `Serial: ${text}`);
                } else if (characteristic.uuid === "2A29") {
                    state.deviceInfo.manufacturer = text;
                    appendLog("INFO", `Manufacturer: ${text}`);
                } else if (characteristic.uuid === IQOS_BLE.batteryCharUUID) {
                    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
                    const batteryPercent = bytes[1];
                    state.deviceInfo.batteryPercent = batteryPercent;
                    el.batteryLevel.textContent = `${batteryPercent}%`;
                    appendLog("INFO", `Batteria (77F38A30): ${batteryPercent}%`);
                } else if (characteristic.uuid === IQOS_BLE.statsCharUUID) {
                    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
                    const puffCount = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
                    state.deviceInfo.puffCount = puffCount;
                    appendLog("INFO", `Puff Count (ECDFA4C0): ${puffCount}`);
                }
            } catch (e) {
                // Ignora
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
            const value = await state.batteryCharacteristic.readValue();
            const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
            const batteryPercent = bytes[1];
            state.deviceInfo.batteryPercent = batteryPercent;
            el.batteryLevel.textContent = `${batteryPercent}%`;
            appendLog("INFO", `Batteria: ${batteryPercent}%`);
        } catch (e) {
            appendLog("ERR", `Lettura batteria fallita: ${e.message}`);
        }
    }
    
    await writeCommand([IQOS_CMD.READ_BATTERY, 0x00], "Read Battery");
}

async function readDiagnostics() {
    appendLog("CMD", "Lettura diagnostica...");
    await writeCommand([IQOS_CMD.READ_DIAGNOSTIC, 0x00], "Read Diagnostic");

    const characteristicLines = state.characteristics.map(({ serviceUUID, characteristic }) => {
        const p = characteristic.properties;
        const capabilities = [p.read && "read", p.write && "write", p.writeWithoutResponse && "writeWithoutResponse", p.notify && "notify", p.indicate && "indicate"].filter(Boolean).join(", ");
        return `${serviceUUID}\n  └─ ${characteristic.uuid} (${capabilities || "nessuna"})`;
    });

    state.diagnosticsText = [
        "=== IQOS Control — Diagnostica ===",
        `Data: ${new Date().toLocaleString("it-IT")}`,
        `Dispositivo: ${state.device.name || "N/D"}`,
        `Stato: ${state.device.gatt?.connected ? "Connesso" : "Disconnesso"}`,
        ``,
        `=== UUID IQOS ===",
        `Servizio: ${IQOS_BLE.serviceUUID}`,
        `Comandi: ${IQOS_BLE.commandCharacteristicUUID}`,
        `Notifiche: ${IQOS_BLE.notificationCharacteristicUUID}`,
        ``,
        `=== Info Dispositivo ===",
        `Nome: ${state.deviceInfo.name || "N/D"}`,
        `Modello: ${state.deviceInfo.model || "N/D"}`,
        `Seriale: ${state.deviceInfo.serial || "N/D"}`,
        `Manufacturer: ${state.deviceInfo.manufacturer || "N/D"}`,
        `Batteria: ${state.deviceInfo.batteryPercent !== null ? `${state.deviceInfo.batteryPercent}%` : "N/D"}`,
        `Puff Count: ${state.deviceInfo.puffCount !== null ? state.deviceInfo.puffCount : "N/D"}`,
        ``,
        `=== GATT ===",
        ...characteristicLines,
    ].join("\n");

    el.diagnosticsOutput.textContent = state.diagnosticsText;
}

async function writeCommand(bytes, description = "Comando") {
    if (!state.commandCharacteristic) {
        appendLog("ERR", "Characteristic comandi non trovata.");
        return;
    }

    const data = Uint8Array.from(bytes);
    appendLog("TX", `${description}: ${Array.from(data, b => b.toString(16).padStart(2, "0")).join(" ").toUpperCase()}`);

    try {
        if (state.commandCharacteristic.properties.write) {
            await state.commandCharacteristic.writeValueWithResponse(data);
        } else if (state.commandCharacteristic.properties.writeWithoutResponse) {
            await state.commandCharacteristic.writeValueWithoutResponse(data);
        }
        appendLog("OK", `${description} inviato.`);
    } catch (error) {
        appendLog("ERR", `${description} fallito: ${error.message}`);
    }
}

async function setBrightness() {
    const level = parseInt(el.brightnessSelect.value, 10);
    appendLog("CMD", `Brightness: ${level}`);
    await writeCommand([IQOS_CMD.SET_BRIGHTNESS, level], "Set Brightness");
}

async function setVibration() {
    const enabled = el.vibrationToggle.checked ? 0x01 : 0x00;
    appendLog("CMD", `Vibration: ${enabled ? "ON" : "OFF"}`);
    await writeCommand([IQOS_CMD.SET_VIBRATION, enabled], "Set Vibration");
}

async function setAutoStart() {
    const enabled = el.autoStartToggle.checked ? 0x01 : 0x00;
    appendLog("CMD", `AutoStart: ${enabled ? "ON" : "OFF"}`);
    await writeCommand([IQOS_CMD.SET_AUTOSTART, enabled], "Set AutoStart");
}

async function setSmartGesture() {
    const enabled = el.smartGestureToggle.checked ? 0x01 : 0x00;
    appendLog("CMD", `Smart Gesture: ${enabled ? "ON" : "OFF"}`);
    await writeCommand([IQOS_CMD.SET_SMART_GESTURE, enabled], "Set Smart Gesture");
}

async function setFlexPuff() {
    const enabled = el.flexPuffToggle.checked ? 0x01 : 0x00;
    appendLog("CMD", `FlexPuff: ${enabled ? "ON" : "OFF"}`);
    await writeCommand([IQOS_CMD.SET_FLEXPUFF, enabled], "Set FlexPuff");
}

async function setFlexBattery() {
    const enabled = el.flexBatteryToggle.checked ? 0x01 : 0x00;
    appendLog("CMD", `FlexBattery: ${enabled ? "ON" : "OFF"}`);
    await writeCommand([IQOS_CMD.SET_FLEXBATTERY, enabled], "Set FlexBattery");
}

async function setPauseMode() {
    const enabled = el.pauseModeToggle.checked ? 0x01 : 0x00;
    appendLog("CMD", `Pause Mode: ${enabled ? "ON" : "OFF"}`);
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
        appendLog("ERR", `Errore: ${error.message}`);
    }
}

async function copyLog() {
    try {
        const logText = el.bleLog.textContent;
        await navigator.clipboard.writeText(logText);
        appendLog("SYS", "Log copiato.");
        alert("✓ Log BLE copiato!");
    } catch (error) {
        appendLog("ERR", `Errore: ${error.message}`);
    }
}

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
el.btnClearLog.addEventListener("click", () => { el.bleLog.textContent = ""; });

setConnectionState("disconnected");
appendLog("SYS", "IQOS Control Web avviato.");
appendLog("INFO", `Servizio: ${IQOS_BLE.serviceUUID}`);
appendLog("INFO", `Comandi: ${IQOS_BLE.commandCharacteristicUUID}`);
appendLog("INFO", `Notifiche: ${IQOS_BLE.notificationCharacteristicUUID}`);
