# Retail Key

Installable loyalty-card wallet that keeps an exact points balance for every card.

How a balance is worked out: your last confirmed balance (typed from a slip, SMS or the shop's app, or read from pasted slip text) plus every purchase or redemption logged after it. Retail Key is not connected to any shop's systems and never claims a balance it can't back.

Run: serve this folder over HTTPS (or `python3 -m http.server` for localhost) and open `index.html`. Camera scanning needs HTTPS and a browser with the BarcodeDetector API (Chrome on Android). Everything else works anywhere, offline.

All files sit side by side in one folder. After changing any file, bump `VERSION` in `service-worker.js`.
