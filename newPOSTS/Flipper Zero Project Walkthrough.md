# Flipper Zero Project Walkthrough

2026-09-19 · @Someone

## Overview

This walkthrough covers one working session spent bringing a secondhand Flipper Zero online safely.

## Firmware: Flashing Unleashed

The Flipper arrived already loaded by a previous owner. Rather than trust an unknown firmware/config, the decision was to reflash it with **Unleashed** — the most popular alternative firmware, actively updated, with region locks removed — using the **browser-based web updater** rather than the qFlipper desktop app.

**Prerequisites confirmed first:**

- A Chromium-based browser is required (Chrome, Chromium, Edge, Brave). Firefox does not support the WebSerial connection these installers use.
- The SD card was backed up (copied off to a computer) before flashing anything, since flashing can overwrite what's on the device.

**Steps taken:**

1. Connected the Flipper via USB-C to the computer being used for the flash.
2. Went to `lab.flipper.net`, clicked Connect, and updated to the **latest official firmware** first. This is a required precondition — Unleashed's installer expects the device to already be on current official firmware, not an unknown prior state.
3. Confirmed the microSD card was seated (needed for the alternative-firmware flash to succeed).
4. Closed the lab.flipper.net tab (only one program can hold the Flipper's USB serial port at a time) and opened `web.unleashedflip.com`.
5. Selected the **Default** build (vs. "No apps" for a bare-bones firmware, or "Extra apps" for more bundled third-party apps preinstalled).
6. Clicked Connect, selected the device, then Install — without disconnecting until it finished.
7. Verified success via **Settings → About** on the device, which showed "Unleashed" and an `unlshd-XXX` version string in place of the official firmware name.

## BadUSB Safety Check

Before trusting a secondhand, pre-loaded Flipper around any computer, we checked whether it could have an auto-firing BadUSB payload.

**The underlying mechanism:** Flipper's BadUSB does not auto-execute just from being plugged in. It only switches into HID keyboard mode when someone manually opens the Bad USB app on the device's own screen, selects a script, and presses OK to run it. Plugging the Flipper in for charging, browsing, or flashing does not by itself type anything.

**The zero-risk check performed:** rather than trust that mechanism alone, the microSD card was pulled out of the Flipper and read directly via a card reader on a computer — no USB connection to the Flipper's own port at all. The `badusb/` folder was checked for any `.txt` DuckyScript files (plain text, so their contents are fully readable before ever running anything), along with a quick look through `apps_data/` for anything unusual.

**One note carried forward:** reflashing the firmware does not clean this up automatically — firmware and the SD card are separate storage, so a fresh flash doesn't touch what's on the card. The SD card check needed to happen regardless of the firmware reflash.

Optional extra precautions discussed (not needed in this case since the SD check came back clean): doing the first live USB connection on a lower-stakes machine rather than a primary daily driver, or using a USB data-blocker/charge-only cable for the very first connection.

## Pi + Flipper Integration Paths

With the Flipper reflashed and checked, four directions were laid out for pairing it with the Kali Raspberry Pi over its USB serial CLI (no GPIO/UART soldering needed — just a USB cable):

- **Automated capture logger** — a script on the Pi that pulls new Sub-GHz/NFC/IR captures off the Flipper on a schedule, instead of manually browsing the device.
- **NFC/RFID cracking offload** — running MIFARE Classic key-recovery math on the Pi's CPU instead of the Flipper's much slower one.
- **Remote-triggered Bad USB** — firing a BadUSB payload from the Pi on a schedule or condition, without touching the Flipper's buttons.
- **Headless drop-box** — Pi and Flipper paired together with a reverse SSH tunnel back to a remote server, for a self-contained remote-triggerable kit.

The capture logger was built first, followed by the cracking-offload work.

## Automated Capture Logger

**Goal:** a script on the Kali Pi that pulls new Sub-GHz/NFC/IR captures off the Flipper on a schedule, without manually browsing the device.

### Initial connectivity check

First confirmed the Pi could talk to the Flipper over USB serial using `pyflipper`:

```bash
pip install pyflipper --break-system-packages
python3 -c "from pyflipper.pyflipper import PyFlipper; f = PyFlipper(com='/dev/ttyACM0'); print(f.device_info.info())"
```

### Switching to a purpose-built storage library

For the actual file-pulling logic, `flipper-fs` was used instead of pyflipper — it's built specifically around reliable storage operations over the Flipper's serial CLI:

```bash
pip install flipper-fs --break-system-packages
```

The logger script watches `/ext/subghz`, `/ext/nfc`, and `/ext/infrared`, tracks which filenames it's already pulled in a local `.seen.json`, and copies anything new into `~/flipper_captures/`, organized by folder and timestamped.

### Three bugs hit along the way

**Bug 1 — list() parser broke on multi-word filenames.** `flipperfs`'s `list()` method split each CLI response line on whitespace and assumed the file's size (in bytes) was always the second word. Any filename containing a space threw off that assumption, producing a `ValueError` when it tried to parse a stray word as a number. Fixed by patching `list()` to use a regex anchored to the end of the line instead of positional word-splitting:

```python
# Patch applied to flipperfs/storage.py's list() method
import re
match = re.match(r"^\[F\]\s+(.+?)\s+(\d+)b$", line)
if match:
    name = match.group(1)
    size = int(match.group(2))
```

**Bug 2 — serial buffer contamination between commands.** The underlying `send_command()` exited its read loop as soon as the prompt marker appeared *anywhere* in the accumulated response — including inside the device's echo of the command itself — and never flushed leftover bytes before sending the next command. This let late-arriving bytes from one command bleed into the next command's response (files actually in `/ext/subghz` briefly appeared to be listed under `/ext/nfc`). Fixed with two changes: reset the input buffer immediately before sending each new command, and only treat the prompt as the end of a response when it's the *last* thing received, not just present anywhere:

```python
# Patch applied to flipperfs/serial_cli.py's send_command()
self.serial.reset_input_buffer()  # drop stale bytes from a prior command
# ...
if response.rstrip().endswith(self.PROMPT):  # not just "in response"
    break
```

**Bug 3 — non-capture files caused a USB I/O error.** A previous owner had also stored some unrelated reference files (PDFs, images, an IR remote or two) inside the Sub-GHz/NFC folders. The Flipper's `storage read` CLI command is built for small plaintext capture files, not multi-megabyte binary files — pulling one through that channel triggered a USB-level disconnect that killed the run partway through. Fixed by filtering to each folder's native capture extension (`.sub`, `.nfc`, `.ir`) before attempting to read anything.

### Final working script

```python
#!/usr/bin/env python3
import json
from pathlib import Path
from datetime import datetime
from flipperfs import FlipperStorage

PORT = "/dev/ttyACM0"
WATCH_DIRS = {
    "/ext/subghz": {".sub"},
    "/ext/nfc": {".nfc"},
    "/ext/infrared": {".ir"},
}
LOCAL_DIR = Path.home() / "flipper_captures"
SEEN_FILE = LOCAL_DIR / ".seen.json"

LOCAL_DIR.mkdir(exist_ok=True)
seen = json.loads(SEEN_FILE.read_text()) if SEEN_FILE.exists() else {}

with FlipperStorage(port=PORT) as storage:
    for remote_dir, allowed_exts in WATCH_DIRS.items():
        seen.setdefault(remote_dir, [])
        try:
            entries = storage.list(remote_dir)
        except Exception as e:
            print(f"Could not list {remote_dir}: {e}")
            continue
        for entry in entries:
            if entry.get("type") != "file":
                continue
            name = entry["name"]
            if not any(name.lower().endswith(ext) for ext in allowed_exts):
                continue
            if name in seen[remote_dir]:
                continue
            try:
                content = storage.read(f"{remote_dir}/{name}")
            except Exception as e:
                print(f"Skipping {remote_dir}/{name}: {e}")
                seen[remote_dir].append(name)
                continue
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            local_sub = LOCAL_DIR / remote_dir.strip("/").replace("/", "_")
            local_sub.mkdir(exist_ok=True)
            out_path = local_sub / f"{ts}_{name}"
            out_path.write_text(content)
            print(f"Pulled {remote_dir}/{name} -> {out_path}")
            seen[remote_dir].append(name)

SEEN_FILE.write_text(json.dumps(seen, indent=2))
```

### Scheduling

```bash
(crontab -l 2>/dev/null; echo "*/15 * * * * /usr/bin/python3 \$HOME/flipper_logger.py >> \$HOME/flipper_logger.log 2>&1") | crontab -
```

Runs every 15 minutes, appended to the existing crontab rather than replacing it. **Result:** confirmed working — a clean run pulled all real Sub-GHz/NFC/IR captures with no skips or errors, correctly ignoring the unrelated reference files.

## NFC/RFID Cracking Offload (In Progress)

**Why this isn't a standard mfoc setup:** the classic "offload cracking to Kali" workflow usually assumes a dedicated NFC reader (PN532, ACR122U) wired to the Pi, attacking a live card directly. No such reader is part of this setup, so the approach instead offloads the **nested-attack key-recovery math** — the same computation the Flipper already attempts on-device when it can't fully read a MIFARE Classic card, just run on the Pi's much faster CPU instead of the Flipper's limited one. Flipper's own documentation notes this calculation can take several minutes on-device due to hardware constraints; that's the specific bottleneck being offloaded.

**Tooling set up so far, on the Pi:**

```bash
sudo apt install build-essential git -y
git clone https://github.com/equipter/mfkey32v2 ~/mfkey32v2
cd ~/mfkey32v2 && make mfkey32v2
```

This compiles `mfkey32v2`, a small C tool that recovers MIFARE Classic sector keys from captured Crypto-1 nonce pairs.

**Status:** paused at the point of checking two previously-captured NFC cards (pulled earlier by the capture logger) on the Flipper's own screen, to see whether either has sectors still locked/unreadable — a fully-cracked card has nothing left to offload. Next step once a target with locked sectors is confirmed: trigger `More → Crack nonces in MFKey32 → Save` on that card (on-device, generates a nonces log file), pull that file to the Pi with the same capture-logger pipeline, and feed it to the compiled `mfkey32v2` tool.
