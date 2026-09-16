# IQOS Control Web

Web Bluetooth control per dispositivi **IQOS ILUMA / ILUMA i / ILUMA i PRIME**.

## ⚠️ Importante

Questa applicazione è in **fase di sviluppo**. Attualmente:

- ✅ Si connette ai dispositivi BLE
- ✅ Legge la batteria (se il dispositivo supporta il Battery Service standard)
- ✅ Scansiona e mostra servizi/characteristic GATT
- ✅ Log completo RX/TX

Le seguenti funzioni **richiedono UUID e payload specifici del protocollo IQOS**:

- ❌ Lettura modello, firmware, seriale
- ❌ Controllo luminosità·°
- ❌ Configurazione vibrazione
- ❌ AutoStart / Smart Gesture
- ❌ FlexPuff / FlexBattery / Pause Mode
- ❌ Find My IQOS
- ❌ Blocco/sblocco dispositivo

## 📋 Requisiti

- **Browser**: Chrome o Edge (desktop o Android)
- **Connessione**: HTTPS o localhost
- **Non supportato**: Safari, iOS, Firefox

## 🚀 Utilizzo

1. Apri il sito su Chrome/Edge
2. Clicca **Connetti** e seleziona il tuo IQOS
3. Usa i pulsanti per leggere info e diagnostica
4. Consulta il **Log BLE** per vedere servizi e characteristic

## 🔧 Per sviluppatori

Per implementare le funzioni avanzate:

1. Clona le repository:
   - [`hauntedfail/iqos`](https://github.com/hauntedfail/iqos)
   - [`hauntedfail/iqos_cli`](https://github.com/hauntedfail/iqos_cli)
   - [`hauntedfail/iqos_ios_app`](https://github.com/hauntedfail/iqos_ios_app)

2. Estrai:
   - UUID del servizio IQOS
   - UUID delle characteristic (comandi, notifiche, info)
   - Payload HEX dei comandi

3. Modifica `app.js`:
   ```javascript
   const IQOS_BLE = {
       serviceUUID: "0000xxxx-0000-1000-8000-00805f9b34fb",
       commandCharacteristicUUID: "0000yyyy-0000-1000-8000-00805f9b34fb",
       notificationCharacteristicUUID: "0000zzzz-0000-1000-8000-00805f9b34fb",
   };
   ```

4. Implementa i comandi in `writeCommand()`

## 📄 Licenza

Progetto sperimentale per uso personale. Non affiliato con IQOS o PMI.

---

**Nota**: Web Bluetooth non è supportato su iOS. Per iPhone serve un'app nativa Swift con CoreBluetooth.
