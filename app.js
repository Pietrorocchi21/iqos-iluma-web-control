// IQOS Control Web - app.js
(function() {
    "use strict";

    console.log("[APP] Starting IQOS Control Web...");

    var IQOS_BLE = {
        serviceUUID: "DAEBB240-B041-11E4-9E45-0002A5D5C51B",
        commandCharacteristicUUID: "04941060-B042-11E4-8BF6-0002A5D5C51B",
        notificationCharacteristicUUID: "E16C6E20-B041-11E4-A4C3-0002A5D5C51B",
        batteryCharUUID: "77F38A30-2B2C-489A-BE71-29E93A04A90A",
        statsCharUUID: "ECDFA4C0-B041-11E4-8B67-0002A5D5C51B",
    };

    var IQOS_CMD = {
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

    var state = {
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

    var el = {};

    function $(id) {
        var elem = document.getElementById(id);
        if (!elem) {
            console.warn("[APP] Element not found: " + id);
        }
        return elem;
    }

    function initElements() {
        console.log("[APP] Initializing elements...");
        el.connectionState = $("connectionState");
        el.deviceName = $("deviceName");
        el.batteryLevel = $("batteryLevel");
        el.rssi = $("rssi");
        el.diagnosticsOutput = $("diagnosticsOutput");
        el.bleLog = $("bleLog");
        el.btnConnect = $("btnConnect");
        el.btnDisconnect = $("btnDisconnect");
        el.btnReadInfo = $("btnReadInfo");
        el.btnReadBattery = $("btnReadBattery");
        el.btnReadDiagnostics = $("btnReadDiagnostics");
        el.brightnessSelect = $("brightnessSelect");
        el.btnSetBrightness = $("btnSetBrightness");
        el.vibrationToggle = $("vibrationToggle");
        el.btnSetVibration = $("btnSetVibration");
        el.btnCopyDiagnostics = $("btnCopyDiagnostics");
        el.btnCopyLog = $("btnCopyLog");
        el.btnClearLog = $("btnClearLog");
        el.autoStartToggle = $("autoStartToggle");
        el.btnSetAutoStart = $("btnSetAutoStart");
        el.smartGestureToggle = $("smartGestureToggle");
        el.btnSetSmartGesture = $("btnSetSmartGesture");
        el.flexPuffToggle = $("flexPuffToggle");
        el.btnSetFlexPuff = $("btnSetFlexPuff");
        el.flexBatteryToggle = $("flexBatteryToggle");
        el.btnSetFlexBattery = $("btnSetFlexBattery");
        el.pauseModeToggle = $("pauseModeToggle");
        el.btnSetPauseMode = $("btnSetPauseMode");
        el.btnFindMyIQOS = $("btnFindMyIQOS");
        el.btnLockDevice = $("btnLockDevice");
        el.btnUnlockDevice = $("btnUnlockDevice");

        console.log("[APP] Elements initialized. btnConnect:", el.btnConnect);
    }

    function timestamp() {
        return new Date().toLocaleTimeString("it-IT", { hour12: false });
    }

    function appendLog(kind, message) {
        if (!el.bleLog) return;
        var line = "[" + timestamp() + "] [" + kind + "] " + message;
        el.bleLog.textContent = line + "\n" + el.bleLog.textContent;
        if (el.bleLog.textContent.length > 30000) {
            el.bleLog.textContent = el.bleLog.textContent.slice(0, 30000);
        }
    }

    function dataToHex(dataView) {
        var bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
        var hex = [];
        for (var i = 0; i < bytes.length; i++) {
            hex.push((bytes[i] < 16 ? "0" : "") + bytes[i].toString(16).toUpperCase());
        }
        return hex.join(" ");
    }

    function dataToString(dataView) {
        var bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
        var str = "";
        for (var i = 0; i < bytes.length; i++) {
            if (bytes[i] !== 0) str += String.fromCharCode(bytes[i]);
        }
        return str;
    }

    function setConnectionState(status) {
        if (!el.connectionState) return;

        var text, className;
        if (status === "disconnected") {
            text = "Disconnesso";
            className = "badge badge-secondary";
        } else if (status === "connecting") {
            text = "Connessione...";
            className = "badge badge-warning";
        } else {
            text = "Connesso";
            className = "badge badge-success";
        }

        el.connectionState.textContent = text;
        el.connectionState.className = className;

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
        if (el.deviceName) el.deviceName.textContent = "–";
        if (el.batteryLevel) el.batteryLevel.textContent = "–";
        if (el.rssi) el.rssi.textContent = "–";
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
        console.log("[APP] Connect button clicked");
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
                var properties = [];
                if (p.read) properties.push("read");
                if (p.write) properties.push("write");
                if (p.writeWithoutResponse) properties.push("writeWithoutResponse");
                if (p.notify) properties.push("notify");
                if (p.indicate) properties.push("indicate");
                appendLog("GATT", "  Char " + characteristic.uuid + " [" + (properties.join(", ") || "nessuna") + "]");

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
            var properties = [];
            if (p.read) properties.push("read");
            if (p.write) properties.push("write");
            if (p.writeWithoutResponse) properties.push("writeWithoutResponse");
            if (p.notify) properties.push("notify");
            if (p.indicate) properties.push("indicate");
            var capabilities = properties.join(", ");
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

        var data = new Uint8Array(bytes);
        var hexArr = [];
        for (var i = 0; i < data.length; i++) {
            hexArr.push((data[i] < 16 ? "0" : "") + data[i].toString(16).toUpperCase());
        }
        appendLog("TX", description + ": " + hexArr.join(" "));

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

    function clearLog() {
        el.bleLog.textContent = "";
    }

    function initAndStart() {
        console.log("[APP] initAndStart called");
        initElements();

        if (!el.btnConnect) {
            console.error("[APP] btnConnect not found! Check HTML.");
            return;
        }

        console.log("[APP] Adding event listeners...");
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
        el.btnClearLog.addEventListener("click", clearLog);

        console.log("[APP] Event listeners added");
        setConnectionState("disconnected");
        appendLog("SYS", "IQOS Control Web avviato.");
        appendLog("INFO", "Servizio: " + IQOS_BLE.serviceUUID);
        appendLog("INFO", "Comandi: " + IQOS_BLE.commandCharacteristicUUID);
        appendLog("INFO", "Notifiche: " + IQOS_BLE.notificationCharacteristicUUID);
        console.log("[APP] Initialization complete");
    }

    // Wait for DOM
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initAndStart);
    } else {
        initAndStart();
    }
})();
