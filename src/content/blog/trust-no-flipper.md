---
title: "Trust No Flipper: Reflashing and Interrogating a Secondhand Pentest Toy"
description: "A secondhand Flipper Zero, a mandatory firmware wipe, a BadUSB paranoia check, and three dumb bugs standing between me and an automated capture logger on the Kali Pi."
pubDate: 2026-09-19
tags: ["hardware", "security", "raspberry-pi"]
---

```text
--[ DON'T TRUST A BOX YOU DIDN'T FLASH YOURSELF ]---------------------
```

Picked up a used Flipper Zero. Previous owner had already loaded it up
with whatever they were loaded up with — some firmware, some config, an
SD card full of who-knows. Cute little pentest toy, sure, but also a tiny
computer with a radio and a USB port that a stranger had unsupervised
access to before I did. I wasn't plugging that into anything until I'd
gutted it and checked what was actually on the card.

**--[ STEP ONE: NUKE THE FIRMWARE ]--**

Decision was to reflash straight to **Unleashed** — the most popular
alt-firmware, actively maintained, region locks stripped out — rather
than trust whatever was already sitting on there. Went with the
browser-based installer instead of the qFlipper desktop app, because I
didn't feel like installing anything extra just to flash a device I
already didn't trust.

Two things had to be true before touching anything:

- A Chromium-based browser, because the installer talks to the Flipper
  over WebSerial and Firefox doesn't support that. Chrome, Edge, Brave,
  whatever — just not Firefox.
- The SD card backed up to a computer first, since flashing can and will
  overwrite what's sitting on it.

From there:

1. Plugged the Flipper into the computer over USB-C.
2. Went to `lab.flipper.net`, hit Connect, and updated to the **latest
   official firmware** first. This part isn't optional — Unleashed's
   installer expects the device to already be on current official
   firmware, not some unknown prior state a stranger left it in.
3. Double-checked the microSD card was actually seated, since the
   alt-firmware flash needs it present to succeed.
4. Closed the `lab.flipper.net` tab — only one program gets to hold the
   Flipper's USB serial port at a time — and opened
   `web.unleashedflip.com` instead.
5. Picked the **Default** build. There's also "No apps" for something
   bare-bones and "Extra apps" if you want more third-party stuff
   bundled in, but Default was the sane middle ground.
6. Connect, select device, Install, and then just... didn't touch it
   until it said it was done.
7. Confirmed it worked via **Settings → About** on the device itself,
   which now said "Unleashed" and an `unlshd-XXX` version string instead
   of the stock firmware name.

**--[ THE PART WHERE I CHECK FOR A BADUSB LANDMINE ]--**

Reflashing the firmware felt good, but it doesn't touch the SD card —
firmware and card are separate storage, so a fresh flash does nothing
to whatever files were already sitting on it. Before trusting this thing
near any of my other machines, I wanted to know if it was carrying an
auto-firing BadUSB payload.

Good news on the mechanism itself: Flipper's BadUSB doesn't auto-execute
just because it's plugged in. It only switches into HID keyboard mode
when someone physically opens the Bad USB app on the device's own
screen, picks a script, and presses OK. Charging it, browsing it,
flashing it — none of that types a single keystroke on its own.

I didn't want to just trust that mechanism, though, so instead of ever
plugging the Flipper's own USB port into anything, I pulled the microSD
card out and read it directly with a card reader — no serial connection
to the Flipper at all. Checked the `badusb/` folder for `.txt`
DuckyScript files (plain text, fully readable before running anything),
and poked through `apps_data/` for anything that looked out of place.
Came back clean.

If it hadn't, or if I'd wanted to be extra about it either way: do the
first live USB connection on a throwaway machine instead of a daily
driver, or use a data-blocker/charge-only cable for that first plug-in.
Wasn't necessary here, but it's the move if the SD check comes back
weird.

**--[ FOUR WAYS TO WIRE IT TO THE KALI PI ]--**

Flipper trusted, card checked, now the actual point: pairing it with the
Kali Raspberry Pi over its USB serial CLI. No GPIO soldering, no UART —
just a USB cable and a CLI on the other end. Laid out four directions:

```text
--[ OPTIONS ]----------------------------------------------------------
  [x] automated capture logger — pull new Sub-GHz/NFC/IR files off the
      Flipper on a schedule instead of browsing the device by hand
  [ ] NFC/RFID cracking offload — run MIFARE Classic key-recovery math
      on the Pi's CPU instead of the Flipper's much slower one
  [ ] remote-triggered BadUSB — fire a payload from the Pi on a
      schedule or condition, no button presses on the device itself
  [ ] headless drop-box — Pi + Flipper + reverse SSH tunnel back to a
      remote box, for a self-contained kit you can leave somewhere
------------------------------------------------------------------------
```

Capture logger first, since everything else kind of depends on having a
working pipe between the two devices anyway. Cracking offload came
right after.

**--[ BUILDING THE CAPTURE LOGGER ]--**

First move was just proving the Pi could talk to the Flipper at all,
using `pyflipper`:

```bash
pip install pyflipper --break-system-packages
python3 -c "from pyflipper.pyflipper import PyFlipper; f = PyFlipper(com='/dev/ttyACM0'); print(f.device_info.info())"
```

Worked. But for the actual file-pulling logic I switched to `flipper-fs`
instead — it's purpose-built around reliable storage operations over the
serial CLI, rather than the general-purpose grab-bag `pyflipper` is:

```bash
pip install flipper-fs --break-system-packages
```

Plan for the script: watch `/ext/subghz`, `/ext/nfc`, and
`/ext/infrared`, keep a local `.seen.json` of what's already been
pulled, and copy anything new into `~/flipper_captures/`, sorted by
folder and timestamped.

Simple in theory. Then I actually ran it.

**--[ THREE BUGS, IN THE ORDER THEY RUINED MY AFTERNOON ]--**

**Bug 1 — filenames with spaces broke the parser.** `flipper-fs`'s
`list()` splits each CLI response line on whitespace and assumes the
file size is always the second word. Any filename with a space in it
throws that off, and it tries to parse a stray word as an integer and
dies with a `ValueError`. Patched `list()` to anchor a regex to the end
of the line instead of counting words:

```python
import re
match = re.match(r"^\[F\]\s+(.+?)\s+(\d+)b$", line)
if match:
    name = match.group(1)
    size = int(match.group(2))
```

**Bug 2 — command responses bleeding into each other.** The underlying
`send_command()` stopped reading as soon as it saw the prompt marker
*anywhere* in the buffer — including inside the device's own echo of the
command — and never cleared leftover bytes before the next command went
out. Result: late bytes from one command showed up glued onto the next
one's response. Files that were actually in `/ext/subghz` briefly showed
up listed under `/ext/nfc`, which is a genuinely unsettling thing to see
your script report. Fixed with two changes — flush the input buffer
before every command, and only treat the prompt as the actual end of a
response when it's the *last* thing in the buffer, not just present
somewhere in it:

```python
self.serial.reset_input_buffer()
# ...
if response.rstrip().endswith(self.PROMPT):
    break
```

**Bug 3 — a stray PDF killed the whole run.** Turns out the previous
owner had also dumped some unrelated files — PDFs, images, a couple of
IR remote dumps — straight into the Sub-GHz/NFC folders. The Flipper's
`storage read` CLI command is built for small plaintext capture files,
not multi-megabyte binaries, and trying to pull one through it triggered
a USB-level disconnect that killed the run partway through. Fixed by
filtering to each folder's native extension (`.sub`, `.nfc`, `.ir`)
before ever attempting a read.

**--[ THE SCRIPT THAT ACTUALLY WORKED ]--**

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

Wired into cron, appended rather than clobbering whatever was already
in there:

```bash
(crontab -l 2>/dev/null; echo "*/15 * * * * /usr/bin/python3 \$HOME/flipper_logger.py >> \$HOME/flipper_logger.log 2>&1") | crontab -
```

Every 15 minutes. Clean run afterward pulled every real Sub-GHz/NFC/IR
capture with zero skips, and correctly ignored all the previous owner's
junk files sitting in the same folders.

**--[ NEXT UP: MAKING THE PI DO THE MATH ]--**

Cracking offload is still in progress, and it's not the standard "wire a
PN532 or ACR122U to the Pi and attack a live card" setup — I don't have
a dedicated NFC reader in this loadout at all. So instead of attacking a
card directly, the plan is to offload the **nested-attack key-recovery
math** — the same computation the Flipper already tries on-device
whenever it can't fully read a MIFARE Classic card, just run on the Pi's
actual CPU instead of the Flipper's noticeably weaker one. Flipper's own
docs admit this calculation can take several minutes on-device; that's
specifically the part getting moved.

Got the tooling compiled on the Pi already:

```bash
sudo apt install build-essential git -y
git clone https://github.com/equipter/mfkey32v2 ~/mfkey32v2
cd ~/mfkey32v2 && make mfkey32v2
```

That builds `mfkey32v2`, which recovers MIFARE Classic sector keys from
captured Crypto-1 nonce pairs. Currently paused checking two NFC cards
the capture logger already pulled in, to find one that still has locked
sectors — a fully-cracked card has nothing left to offload, which would
make for an anticlimactic test run. Once I've got a target: `More →
Crack nonces in MFKey32 → Save` on the Flipper itself, pull the
resulting nonce log down through the same capture-logger pipeline, and
feed it to the compiled binary.

That part's a post of its own once it actually works. For now the Pi
and the Flipper are talking, the junk files are filtered out, and
nothing on the card was trying to type at me. Good enough for one
sitting.
