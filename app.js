"use strict";

/*
 * IQOS Control Web — Web Bluetooth per ILUMA / ILUMA i / ILUMA i PRIME
 * 
 * UUID identificati da IQOS ILUMA i (16/09/2026):
 * - Servizio IQOS: DAEBB240-B041-11E4-9E45-0002A5D5C51B
 * - Comandi (write): 04941060-B042-11E4-8BF6-0002A5D5C51B
 * - Comandi+Notify: E16C6E20-B041-11E4-A4C3-0002A5D5C51B
 * - Device Info: 2A24, 2A25, 2A28, 2A29 (standard)
 */

const IQOS_BLE = {
    // Servizio IQOS
    serviceUUID: "DAEBB240-B041-11E4-9E45-0002A5D5C51B",
    
    // Characteristic per i comandi
    commandCharacteristicUUID: "04941060-B042-11E4-8BF6-0002A5D5C51B",
    
    // Characteristic per notifiche (opzionale)
    notificationCharacteristicUUID: "E16C6E20-B041-11E4-A4C3-0002A5D5C51B",
    
    // Device Information (standard)
    deviceNameCharUUID: "2A24",
    serialNumberCharUUID: "2A25",
    modelNumberCharUUID: "2A28",
    manufacturerCharUUID: "2A29",
    
    // Battery Service (non trovato su IQOS, usiamo characteristic proprietarie)
    batteryServiceUUID: null,
    batteryLevelCharacteristicUUID: null,
};

const state = {
    device: null,
    server: null,
    services: [],
    characteristics: [],
    commandCharacteristic: null,
    notificationCharacteristic: null,
    deviceInfoChar: null,
    diagnosticsText: "Nessun dato diagnostico disponibile.",
    settings: {
        autoStart: null,
        smartGesture: null,
        brightness: null,
        vibration: {
            heatStart: null,
            deviceReady: null,
            sessionEnd: null,
            termination: null,
            charging: null,
        },
        flexPuff: null,
        flexBattery: null,
        pauseMode: null,
    },
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
    
    // Funzioni avanzate
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
    return new TextDecoder().decode(bytes);
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
    state.deviceInfoChar = null;
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
            optionalServices: [
                IQOS_BLE.serviceUUID,
                "0000180a-0000-1000-8000-00805f9b34fb", // Device Information
            ],
        };

        state.device = await navigator.bluetooth.requestDevice(options);
        state.device.addEventListener("gattserverdisconnected", onDisconnected);
        el.deviceName.textContent = state.device.name || "Dispositivo BLE senza nome";
        appendLog("SYS", `Selezionato: ${state.device.name || state.device.id}`);

        state.server = await state.device.gatt.connect();
        appendLog("SYS", "GATT connesso.");

        await discoverGatt();
        setConnectionState("connected");
        
        // Abilita notifiche se trovate
        if (state.notificationCharacteristic) {
            await enableNotifications(state.notificationCharacteristic);
        }
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
            appendLog("GATT", `  Char ${characteristic.uuid} [${properties || "nessuna"}]`);

            // Identifica characteristic IQOS per UUID
            if (characteristic.uuid === IQOS_BLE.commandCharacteristicUUID) {
                state.commandCharacteristic = characteristic;
                appendLog("INFO", `✓ Characteristic comandi: ${characteristic.uuid}`);
            }

            if (characteristic.uuid === IQOS_BLE.notificationCharacteristicUUID) {
                state.notificationCharacteristic = characteristic;
                appendLog("INFO", `✓ Characteristic notifiche: ${characteristic.uuid}`);
            }

            // Device Information
            if (characteristic.uuid === IQOS_BLE.deviceNameCharUUID) {
                state.deviceInfoChar = characteristic;
            }
        }
    }

    if (!state.commandCharacteristic) {
        appendLog("WARN", "⚠ Characteristic comandi non trovata!");
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

    // Parser risposte IQOS (da implementare)
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

async function readDeviceInfo() {
    if (!state.device) return;

    let infoText = [
        "=== IQOS Control — Info Dispositivo ===",
        `Data: ${new Date().toLocaleString("it-IT")}`,
        `Nome BLE: ${state.device.name || "Non disponibile"}`,
        `ID: ${state.device.id}`,
        ``,
        `=== Characteristic identificate ===`,
        `Comandi: ${state.commandCharacteristic ? state.commandCharacteristic.uuid : "❌ Non trovata"}`,
        `Notifiche: ${state.notificationCharacteristic ? state.notificationCharacteristic.uuid : "❌ Non trovata"}`,
        ``,
    ];

    // Leggi Device Information
    if (state.deviceInfoChar && state.deviceInfoChar.properties.read) {
        try {
            const value = await state.deviceInfoChar.readValue();
            const text = dataToString(value);
            infoText.push(`✓ Device Name: ${text}`);
            el.deviceName.textContent = text;
        } catch (e) {
            infoText.push(`✗ Device Name: ${e.message}`);
        }
    }

    // Cerca altre characteristic leggibili
    for (const { serviceUUID, characteristic } of state.characteristics) {
        if (characteristic.properties.read && !characteristic.properties.write) {
            try {
                const value = await characteristic.readValue();
                const hex = dataToHex(value);
                const text = dataToString(value);
                infoText.push(`${characteristic.uuid}: ${hex} (${text})`);
            } catch (e) {
                // Ignora errori di lettura
            }
        }
    }

    state.diagnosticsText = infoText.join("\n");
    el.diagnosticsOutput.textContent = state.diagnosticsText;
    appendLog("INFO", "Informazioni dispositivo aggiornate.");
}

async function readBattery() {
    appendLog("INFO", "Lettura batteria: IQOS non usa Battery Service standard. Usa characteristic proprietarie.");
    el.batteryLevel.textContent = "N/A";
    alert("La batteria IQOS richiede comandi proprietari. Funzione da implementare.");
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
        "=== IQOS Control — Diagnostica BLE ===",
        `Data: ${new Date().toLocaleString("it-IT")}`,
        `Dispositivo: ${state.device.name || "Senza nome"}`,
        `Stato GATT: ${state.device.gatt?.connected ? "Connesso" : "Disconnesso"}`,
        ``,
        `=== UUID IQOS ILUMA ===`,
        `Servizio: ${IQOS_BLE.serviceUUID}`,
        `Comandi: ${IQOS_BLE.commandCharacteristicUUID}`,
        `Notifiche: ${IQOS_BLE.notificationCharacteristicUUID}`,
        ``,
        `=== Servizi e characteristic rilevati ===`,
        ...characteristicLines,
        ``,
        `=== Funzioni implementate ===`,
        `✓ Scansione e connessione BLE`,
        `✓ Discovery automatico servizi/characteristic`,
        `✓ Log RX/TX completo`,
        `✓ Lettura Device Information`,
        ``,
        `=== Funzioni da implementare ===`,
        `✗ Lettura batteria`,
        `✗ Controllo luminosità·°`,
        `✗ Configurazione vibrazione`,
        `✗ AutoStart / Smart Gesture`,
        `✗ FlexPuff / FlexBattery / Pause Mode`,
        `✗ Find My IQOS`,
        `✗ Blocco/sblocco dispositivo`,
    ].join("\n");

    el.diagnosticsOutput.textContent = state.diagnosticsText;
    appendLog("INFO", "Diagnostica aggiornata.");
}

async function writeCommand(bytes, description = "Comando") {
    if (!state.commandCharacteristic) {
        appendLog("ERR", "Characteristic comandi non identificata.");
        alert("❌ Nessuna caratteristica scrivibile trovata. Assicurati che il dispositivo IQOS sia connesso.");
        return;
    }

    const data = Uint8Array.from(bytes);
    appendLog("TX", `${description}: ${Array.from(data, b => b.toString(16).padStart(2, "0")).join(" ").toUpperCase()}`);

    try {
        if (state.commandCharacteristic.properties.write) {
            await state.commandCharacteristic.writeValueWithResponse(data);
        } else if (state.commandCharacteristic.properties.writeWithoutResponse) {
            await state.commandCharacteristic.writeValueWithoutResponse(data);
        } else {
            throw new Error("La characteristic non è scrivibile.");
        }
        appendLog("OK", `${description} inviato.`);
    } catch (error) {
        appendLog("ERR", `${description} fallito: ${error.message}`);
        throw error;
    }
}

// Comandi IQOS (placeholder - da implementare con payload reali)
async function setBrightness() {
    const level = parseInt(el.brightnessSelect.value, 10);
    appendLog("INFO", `Richiesta luminosità°°livello ${level}`);
    alert(`Luminosità°°livello ${level}: comando da implementare con payload IQOS`);
}

async function setVibration() {
    const enabled = el.vibrationToggle.checked;
    appendLog("INFO", `Richiesta vibrazione: ${enabled ? "ON" : "OFF"}`);
    alert(`Vibrazione ${enabled ? "ON" : "OFF"}: comando da implementare con payload IQOS`);
}

async function setAutoStart() {
    const enabled = el.autoStartToggle.checked;
    appendLog("INFO", `Richiesta AutoStart: ${enabled ? "ON" : "OFF"}`);
    alert(`AutoStart ${enabled ? "ON" : "OFF"}: comando da implementare con payload IQOS`);
}

async function setSmartGesture() {
    const enabled = el.smartGestureToggle.checked;
    appendLog("INFO", `Richiesta Smart Gesture: ${enabled ? "ON" : "OFF"}`);
    alert(`Smart Gesture ${enabled ? "ON" : "OFF"}: comando da implementare con payload IQOS`);
}

async function setFlexPuff() {
    const enabled = el.flexPuffToggle.checked;
    appendLog("INFO", `Richiesta FlexPuff: ${enabled ? "ON" : "OFF"}`);
    alert(`FlexPuff ${enabled ? "ON" : "OFF"}: comando da implementare con payload IQOS`);
}

async function setFlexBattery() {
    const enabled = el.flexBatteryToggle.checked;
    appendLog("INFO", `Richiesta FlexBattery: ${enabled ? "ON" : "OFF"}`);
    alert(`FlexBattery ${enabled ? "ON" : "OFF"}: comando da implementare con payload IQOS`);
}

async function setPauseMode() {
    const enabled = el.pauseModeToggle.checked;
    appendLog("INFO", `Richiesta Pause Mode: ${enabled ? "ON" : "OFF"}`);
    alert(`Pause Mode ${enabled ? "ON" : "OFF"}: comando da implementare con payload IQOS`);
}

async function findMyIQOS() {
    appendLog("INFO", "Richiesta Find My IQOS");
    alert("Find My IQOS: comando da implementare con payload IQOS");
}

async function lockDevice() {
    appendLog("INFO", "Richiesta blocco dispositivo");
    alert("Blocco dispositivo: comando da implementare con payload IQOS");
}

async function unlockDevice() {
    appendLog("INFO", "Richiesta sblocco dispositivo");
    alert("Sblocco dispositivo: comando da implementare con payload IQOS");
}

async function copyDiagnostics() {
    try {
        await navigator.clipboard.writeText(state.diagnosticsText);
        appendLog("SYS", "Dati diagnostici copiati negli appunti.");
        alert("✓ Dati diagnostici copiati!");
    } catch (error) {
        appendLog("ERR", `Copia dati: ${error.message || error}`);
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
el.btnClearLog.addEventListener("click", () => {
    el.bleLog.textContent = "";
});

setConnectionState("disconnected");
appendLog("SYS", "IQOS Control Web avviato.");
appendLog("INFO", "UUID IQOS configurati:");
appendLog("INFO", `  Servizio: ${IQOS_BLE.serviceUUID}`);
appendLog("INFO", `  Comandi: ${IQOS_BLE.commandCharacteristicUUID}`);
appendLog("INFO", `  Notifiche: ${IQOS_BLE.notificationCharacteristicUUID}`);
