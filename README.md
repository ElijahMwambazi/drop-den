# Drop Den

<img src="frontend/public/favicon.png" alt="Drop Den" width="128" />

Drop Den moves files and short messages between devices on the same local
network. There are no accounts, no cloud uploads, and no public sharing links.

Run Drop Den on one computer, then connect nearby phones, tablets, and other
computers through the displayed local address or QR code.

## What you can do

- Share several files at once with everyone or a specific device.
- Preview images, video, and audio before downloading.
- Download individual files or the available files as a ZIP.
- Send short messages between connected devices.
- Use the browser interface on Chrome, Firefox, and other modern browsers.
- Run Drop Den as a compact Linux desktop app.
- Receive files from the Android share sheet using the Android app.

Transfers remain on the host computer and normally expire after 24 hours.
Drop Den is intended for trusted home, office, and event networks—not direct
exposure to the public internet.

## Downloads

Public release downloads are being prepared. Releases will provide:

- a Linux desktop package;
- an Android APK;
- a server package for browser-based access.

Until the first public release is published, contributors can build Drop Den
from source using the [development guide](docs/DEVELOPMENT.md).

## Getting started

1. Install and start Drop Den on the computer that will act as the host.
2. Open the local address displayed by the host on another device, or scan its
   QR code.
3. Give the device a name and enter the six-digit join PIN shown by the host.
4. Choose files, select a destination, and send.

All participating devices must be connected to the same local network and able
to reach the host computer.

## Supported experiences

| Experience | Status |
| --- | --- |
| Browser clients | Supported on modern Chrome and Firefox |
| Linux desktop host | Available; public package preparation is ongoing |
| Android client and share target | Implemented; release packaging pending |
| Windows and macOS packages | Planned |

## Privacy and safety

- Files pass through the host computer, not a cloud service.
- Joining devices require a PIN after the host is created.
- Private operations require a registered device identity.
- Transfers and messages are automatically cleaned up after their retention
  period.
- Anyone controlling the host computer can access its locally stored data.

Use Drop Den only on a network and host computer you trust.

## Learn more

- [Project and technical overview](docs/dropden.md)
- [Known issues and fixes](docs/ISSUES.md)
- [Roadmap](docs/ROADMAP.md)
- [Security model](docs/SECURITY.md)
- [Development guide](docs/DEVELOPMENT.md)
