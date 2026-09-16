"use strict";

const IQOS_BLE = {
    serviceUUID: null,
    commandCharacteristicUUID: null,
    notificationCharacteristicUUID: null,
    deviceInfoCharacteristicUUID: null,
    batteryServiceUUID: "battery_service",
    batteryLevelCharacteristicUUID: "battery_level",
};

const state = {
    device: null,
    server: null,
    services: [],
    characteristics: [],
    commandCharacteristic: null,
    notificationCharacteristic: null,
    batteryCharacteristic: null,
    diagnosticsText: "Nessun dato diagnostico disponibile.",
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
    btnClearLog: document.querySelector("#btnClearLog"),
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
    el.btnSetBrightness.disabled = !connected || !state.commandCharacteristic;
    el.vibrationToggle.disabled = !connected;
    el.btnSetVibration.disabled = !connected || !state.commandCharacteristic;
    el.btnCopyDiagnostics.disabled = !connected;
}

function resetDeviceState() {
    state.server = null;
    state.services = [];
    state.characteristics = [];
    state.commandCharacteristic = null;
    state.notificationCharacteristic = null;
    state.batteryCharacteristic = null;
    el.deviceName.textContent = "–";
    el.batteryLevel.textContent = "–";
    el.rssi.textContent = "–";
}

function bluetoothAvailable() {
    if (!navigator.bluetooth) {
        alert("Web Bluetooth non è disponibile. Usa Chrome o Edge su desktop/Android tramite HTTPS o localhost.");
        appendLog("ERR", "Web Bluetooth non supportato dal browser.");
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
            optionalServices: [IQOS_BLE.batteryServiceUUID],
        };

        state.device = await navigator.bluetooth.requestDevice(options);
        state.device.addEventListener("gattserverdisconnected", onDisconnected);
        el.deviceName.textContent = state.device.name || "Dispositivo BLE senza nome";
        appendLog("SYS", `Selezionato: ${state.device.name || state.device.id}`);

        state.server = await state.device.gatt.connect();
        appendLog("SYS", "GATT connesso.");

        await discoverGatt();
        setConnectionState("connected");
        await readBattery();
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
            const properties = [
                p.read ? "read" : null,
                p.write ? "write" : null,
                p.writeWithoutResponse ? "writeWithoutResponse" : null,
                p.notify ? "notify" : null,
                p.indicate ? "indicate" : null,
            ].filter(Boolean).join(", ");
            appendLog("GATT", `  Char ${characteristic.uuid} [${properties || "nessuna proprietà nota"}]`);

            if (service.uuid === IQOS_BLE.batteryServiceUUID &&
                characteristic.uuid === IQOS_BLE.batteryLevelCharacteristicUUID) {
                state.batteryCharacteristic = characteristic;
            }

            if (IQOS_BLE.commandCharacteristicUUID &&
                characteristic.uuid === IQOS_BLE.commandCharacteristicUUID) {
                state.commandCharacteristic = characteristic;
            }

            if (IQOS_BLE.notificationCharacteristicUUID &&
                characteristic.uuid === IQOS_BLE.notificationCharacteristicUUID) {
                state.notificationCharacteristic = characteristic;
                await enableNotifications(characteristic);
            }
        }
    }

    if (!state.batteryCharacteristic) {
        const batteryService = services.find(service => service.uuid === IQOS_BLE.batteryServiceUUID);
        if (batteryService) {
            state.batteryCharacteristic = await batteryService.getCharacteristic(IQOS_BLE.batteryLevelCharacteristicUUID);
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
}

function onDisconnected() {
    appendLog("SYS", "Dispositivo disconnesso.");
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

async function readBattery() {
    try {
        if (!state.batteryCharacteristic) {
            appendLog("INFO", "Battery Service standard non trovato.");
            return;
        }

        const value = await state.batteryCharacteristic.readValue();
        const level = value.getUint8(0);
        el.batteryLevel.textContent = `${level}%`;
        appendLog("RX", `Battery Level: ${level}% (${dataToHex(value)})`);
    } catch (error) {
        appendLog("ERR", `Lettura batteria: ${error.message || error}`);
    }
}

async function readDeviceInfo() {
    if (!state.device) return;

    const lines = [
        `Nome BLE: ${state.device.name || "Non disponibile"}`,
        `ID browser: ${state.device.id}`,
        `Servizi GATT scoperti: ${state.services.length}`,
        `Characteristic scoperte: ${state.characteristics.length}`,
        "",
        "Per modello, firmware e seriale è necessario inserire gli UUID e i comandi verificati.",
    ];
    state.diagnosticsText = lines.join("\n");
    el.diagnosticsOutput.textContent = state.diagnosticsText;
    appendLog("INFO", "Informazioni GATT di base aggiornate.");
}

async function readDiagnostics() {
    if (!state.device) return;

    const characteristicLines = state.characteristics.map(({ serviceUUID, characteristic }) => {
        const p = characteristic.properties;
        const capabilities = [
            p.read && "read",
            p.write && "write",
            p.writeWithoutResponse && "writeWithoutResponse",
            p.notify && "notify",
            p.indicate && "indicate",
        ].filter(Boolean).join(", ");
        return `${serviceUUID}\n  └─ ${characteristic.uuid} (${capabilities || "nessuna"})`;
    });

    state.diagnosticsText = [
        "IQOS Control — Diagnostica BLE",
        `Data: ${new Date().toLocaleString("it-IT")}`,
        `Dispositivo: ${state.device.name || "Senza nome"}`,
        `Stato GATT: ${state.device.gatt?.connected ? "Connesso" : "Disconnesso"}`,
        `Batteria: ${el.batteryLevel.textContent}`,
        "",
        "Servizi e characteristic rilevati:",
        ...characteristicLines,
        "",
        "Puff count, giorni di utilizzo, tensione, firmware: non letti finché°°protocollo e UUID non sono verificati.",
    ].join("\n");

    el.diagnosticsOutput.textContent = state.diagnosticsText;
    appendLog("INFO", "Diagnostica GATT aggiornata.");
}

async function writeVerifiedCommand(name, bytes) {
    if (!state.commandCharacteristic) {
        appendLog("ERR", `Characteristic comandi non configurata: ${name}.`);
        return;
    }

    const data = Uint8Array.from(bytes);
    appendLog("TX", `${name}: ${Array.from(data, b => b.toString(16).padStart(2, "0")).join(" ").toUpperCase()}`);

    if (state.commandCharacteristic.properties.write) {
        await state.commandCharacteristic.writeValueWithResponse(data);
    } else if (state.commandCharacteristic.properties.writeWithoutResponse) {
        await state.commandCharacteristic.writeValueWithoutResponse(data);
    } else {
        throw new Error("La characteristic dei comandi non è scrivibile.");
    }
}

async function setBrightness() {
    alert("Comando non ancora configurato: inserisci il payload HEX verificato in app.js.");
    appendLog("INFO", "Luminosità°°non inviata: payload IQOS non verificato.");
}

async function setVibration() {
    alert("Comando non ancora configurato: inserisci il payload HEX verificato in app.js.");
    appendLog("INFO", "Vibrazione non inviata: payload IQOS non verificato.");
}

async function copyDiagnostics() {
    try {
        await navigator.clipboard.writeText(state.diagnosticsText);
        appendLog("SYS", "Dati diagnostici copiati negli appunti.");
    } catch (error) {
        appendLog("ERR", `Copia dati: ${error.message || error}`);
    }
}

el.btnConnect.addEventListener("click", connect);
el.btnDisconnect.addEventListener("click", disconnect);
el.btnReadInfo.addEventListener("click", readDeviceInfo);
el.btnReadBattery.addEventListener("click", readBattery);
el.btnReadDiagnostics.addEventListener("click", readDiagnostics);
el.btnSetBrightness.addEventListener("click", setBrightness);
el.btnSetVibration.addEventListener("click", setVibration);
el.btnCopyDiagnostics.addEventListener("click", copyDiagnostics);
el.btnClearLog.addEventListener("click", () => {
    el.bleLog.textContent = "";
});

setConnectionState("disconnected");
appendLog("SYS", "IQOS Control Web avviato.");
