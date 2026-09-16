"use strict";

/*
 * IQOS Control Web — Web Bluetooth per ILUMA / ILUMA i / ILUMA i PRIME
 * 
 * Nota: Gli UUID specifici del protocollo IQOS devono essere inseriti qui.
 * Questa versione usa discovery automatico delle characteristic.
 */

const IQOS_BLE = {
    // UUID del servizio IQOS (da inserire quando verificato)
    // Possibili candidati: servizi proprietari 128-bit o 0xFE03 (se IQOS usa servizi standard)
    serviceUUID: null,
    
    // UUID delle characteristic (da inserire quando verificati)
    commandCharacteristicUUID: null,
    notificationCharacteristicUUID: null,
    deviceInfoCharacteristicUUID: null,
    
    // Battery Service standard
    batteryServiceUUID: "0000180f-0000-1000-8000-00805f9b34fb",
    batteryLevelCharacteristicUUID: "00002a19-0000-1000-8000-00805f9b34fb",
};

const state = {
    device: null,
    server: null,
    services: [],
    characteristics: [],
    commandCharacteristic: null,
    notificationCharacteristic: null,
    batteryCharacteristic: null,
    deviceInfoCharacteristic: null,
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
    
    // Nuovi elementi per le funzioni avanzate
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
    state.batteryCharacteristic = null;
    state.deviceInfoCharacteristic = null;
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
                IQOS_BLE.batteryServiceUUID,
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
        await readBattery();
        
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

            // Battery Service
            if (characteristic.uuid === IQOS_BLE.batteryLevelCharacteristicUUID) {
                state.batteryCharacteristic = characteristic;
            }

            // Identifica characteristic IQOS in base alle proprietà
            // Tipicamente: una characteristic scrivibile per comandi, una per notifiche
            if (p.write || p.writeWithoutResponse) {
                if (!state.commandCharacteristic) {
                    state.commandCharacteristic = characteristic;
                    appendLog("INFO", `Identificata characteristic comandi: ${characteristic.uuid}`);
                }
            }

            if (p.notify || p.indicate) {
                if (!state.notificationCharacteristic) {
                    state.notificationCharacteristic = characteristic;
                    appendLog("INFO", `Identificata characteristic notifiche: ${characteristic.uuid}`);
                }
            }

            // Device Information
            if (service.uuid === "0000180a-0000-1000-8000-00805f9b34fb") {
                if (!state.deviceInfoCharacteristic && p.read) {
                    state.deviceInfoCharacteristic = characteristic;
                }
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

    // Qui andrebbe il parser delle risposte IQOS
    // Per ora logghiamo solo i dati grezzi
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

    let infoText = [
        `Nome BLE: ${state.device.name || "Non disponibile"}`,
        `ID browser: ${state.device.id}`,
        `Servizi GATT scoperti: ${state.services.length}`,
        `Characteristic scoperte: ${state.characteristics.length}`,
        "",
        "=== Characteristic identificate ===",
        `Comandi: ${state.commandCharacteristic ? state.commandCharacteristic.uuid : "Non identificata"}`,
        `Notifiche: ${state.notificationCharacteristic ? state.notificationCharacteristic.uuid : "Non identificata"}`,
        `Batteria: ${state.batteryCharacteristic ? state.batteryCharacteristic.uuid : "Non identificata"}`,
        `Info dispositivo: ${state.deviceInfoCharacteristic ? state.deviceInfoCharacteristic.uuid : "Non identificata"}`,
        "",
        "=== Impostazioni correnti ===",
    ];

    // Leggi Device Information se disponibile
    if (state.deviceInfoCharacteristic && state.deviceInfoCharacteristic.properties.read) {
        try {
            const value = await state.deviceInfoCharacteristic.readValue();
            infoText.push(`Device Info: ${dataToHex(value)}`);
        } catch (e) {
            infoText.push("Device Info: non leggibile");
        }
    }

    infoText.push("");
    infoText.push("Nota: Per modello, firmware e seriale servono UUID e comandi specifici IQOS.");

    state.diagnosticsText = infoText.join("\n");
    el.diagnosticsOutput.textContent = state.diagnosticsText;
    appendLog("INFO", "Informazioni GATT aggiornate.");
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
        `Batteria: ${el.batteryLevel.textContent}`,
        "",
        "=== Servizi e characteristic rilevati ===",
        ...characteristicLines,
        "",
        "=== Funzioni implementate ===",
        "✓ Scansione e connessione BLE",
        "✓ Lettura batteria (standard)",
        "✓ Discovery automatico servizi/characteristic",
        "✓ Log RX/TX completo",
        "",
        "=== Funzioni da implementare (servono UUID IQOS) ===",
        "✗ Lettura modello/firmware/seriale",
        "✗ Controllo luminosità··",
        "✗ Configurazione vibrazione",
        "✗ AutoStart / Smart Gesture",
        "✗ FlexPuff / FlexBattery / Pause Mode",
        "✗ Find My IQOS",
        "✗ Blocco/sblocco dispositivo",
    ].join("\n");

    el.diagnosticsOutput.textContent = state.diagnosticsText;
    appendLog("INFO", "Diagnostica aggiornata.");
}

async function writeCommand(bytes, description = "Comando") {
    if (!state.commandCharacteristic) {
        appendLog("ERR", "Characteristic comandi non identificata.");
        alert("Nessuna caratteristica scrivibile trovata. Assicurati che il dispositivo IQOS sia connesso e che il protocollo BLE sia correttamente identificato.");
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

async function setBrightness() {
    const level = parseInt(el.brightnessSelect.value, 10);
    // Placeholder: comando da definire con UUID IQOS
    appendLog("INFO", `Richiesta luminosità·°livello ${level} (comando da implementare)`);
    alert("Comando luminosità°°non ancora implementato: servono UUID e payload IQOS verificati.");
}

async function setVibration() {
    const enabled = el.vibrationToggle.checked;
    appendLog("INFO", `Richiesta vibrazione: ${enabled ? "ON" : "OFF"} (comando da implementare)`);
    alert("Comando vibrazione non ancora implementato: servono UUID e payload IQOS verificati.");
}

async function setAutoStart() {
    const enabled = el.autoStartToggle.checked;
    appendLog("INFO", `Richiesta AutoStart: ${enabled ? "ON" : "OFF"} (comando da implementare)`);
    alert("AutoStart non ancora implementato: servono UUID e payload IQOS verificati.");
}

async function setSmartGesture() {
    const enabled = el.smartGestureToggle.checked;
    appendLog("INFO", `Richiesta Smart Gesture: ${enabled ? "ON" : "OFF"} (comando da implementare)`);
    alert("Smart Gesture non ancora implementato: servono UUID e payload IQOS verificati.");
}

async function setFlexPuff() {
    const enabled = el.flexPuffToggle.checked;
    appendLog("INFO", `Richiesta FlexPuff: ${enabled ? "ON" : "OFF"} (comando da implementare)`);
    alert("FlexPuff non ancora implementato: servono UUID e payload IQOS verificati.");
}

async function setFlexBattery() {
    const enabled = el.flexBatteryToggle.checked;
    appendLog("INFO", `Richiesta FlexBattery: ${enabled ? "ON" : "OFF"} (comando da implementare)`);
    alert("FlexBattery non ancora implementato: servono UUID e payload IQOS verificati.");
}

async function setPauseMode() {
    const enabled = el.pauseModeToggle.checked;
    appendLog("INFO", `Richiesta Pause Mode: ${enabled ? "ON" : "OFF"} (comando da implementare)`);
    alert("Pause Mode non ancora implementato: servono UUID e payload IQOS verificati.");
}

async function findMyIQOS() {
    appendLog("INFO", "Richiesta Find My IQOS (comando da implementare)");
    alert("Find My IQOS non ancora implementato: servono UUID e payload IQOS verificati.");
}

async function lockDevice() {
    appendLog("INFO", "Richiesta blocco dispositivo (comando da implementare)");
    alert("Blocco dispositivo non ancora implementato: servono UUID e payload IQOS verificati.");
}

async function unlockDevice() {
    appendLog("INFO", "Richiesta sblocco dispositivo (comando da implementare)");
    alert("Sblocco dispositivo non ancora implementato: servono UUID e payload IQOS verificati.");
}

async function copyDiagnostics() {
    try {
        await navigator.clipboard.writeText(state.diagnosticsText);
        appendLog("SYS", "Dati diagnostici copiati negli appunti.");
        alert("Dati diagnostici copiati!");
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
