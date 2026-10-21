# BarScan Mobile App (Android)

Barcode scanner companion app built with React Native and Expo. Scans barcodes with your Android camera, maintains a local offline database (with quantities and notes), and transmits scans over local Wi-Fi to the [BarScan Windows Receiver](https://github.com/pranayjavvaji/Scanner-windows-receiver.git).

---

## Features
- **High-Speed Scanning:** Google MLKit camera scanner supporting 13 barcode formats (EAN/UPC, Code 128, Code 39, ITF, QR Code, Data Matrix, PDF417, etc.) with torch toggle.
- **Offline Library:** Local SQLite database with search, manual barcode addition, quantity editing, notes, CSV export, and batch delete.
- **Photo Import:** Pick images from your photo gallery and automatically extract barcodes.
- **3 Scan Modes:** 
  1. *Store & Send* (saves to local database and types on PC).
  2. *Send Only* (types on PC without storing).
  3. *Store Only* (offline inventory counting).
- **Fast PC Pairing:** Pair by scanning the receiver's QR code, auto-discover on LAN, or enter PC IP address manually.

---

## Quick Start (Expo Go on your Phone)

### 1. Requirements
* [Node.js 18+](https://nodejs.org/) installed on your computer.
* **Expo Go** app installed on your Android phone from Google Play Store.
* Both your phone and computer connected to the **same Wi-Fi network**.

### 2. Run the Development Server
In this folder, start the Expo development server:
```bash
npm start
```
* A QR code will appear in your terminal.
* Open the **Expo Go** app on your Android phone.
* Tap **"Scan QR code"** in Expo Go and point it at the terminal QR code.
* The app will load onto your phone.

---

## Building an Installable APK (No Expo Go Needed)

To build a standalone `.apk` file that anyone can install directly on their Android device:

1. Install EAS CLI globally:
   ```bash
   npm install -g eas-cli
   ```
2. Log in with your free Expo account (create one at https://expo.dev if needed):
   ```bash
   eas login
   ```
3. Build the APK:
   ```bash
   eas build -p android --profile preview
   ```
4. EAS will build the `.apk` in the cloud and provide a direct download link when complete.
