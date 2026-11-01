# NightNova fully no-install Windows portable EXE

## Run
Download **NightNova-0.1.8-portable.exe** and place it in a writable folder, for example D:\\NightNova. Double-click it. **Do not launch the -setup.exe**, which is the traditional installer.

There is no installation wizard, Start Menu entry, system installer or registration. On each launch the portable executable temporarily unpacks its application contents under Windows TEMP; this is an internal runtime operation, not installation. It can start more slowly than the installed edition.

## Persistent login and settings
On the first launch it creates **NightNova-Data** next to the EXE. It stores the browser profile, cookies and settings there, *not* in the installed edition's AppData directory. Leave the EXE and NightNova-Data together to preserve your login and sessions. Do not put your portable EXE in a read-only Program Files/system location. Existing installed NightNova data is not copied automatically.

Keep the NightNova-Data directory private. Cookies can be protected by Windows OS credential encryption and moving a USB drive to another PC may require re-login. Closing the application does not delete your portable profile. Windows temporary unpack files may be produced by electron-builder, but are not the persistent browser profile.

## Build and acceptance
- `npm run package:win:portable` builds only the standalone no-install EXE.
- `npm run release:manifest:portable` writes `release/NIGHTNOVA_PORTABLE_MANIFEST.json`.
- The Windows workflow `nightnova-windows-portable.yml` is manual-only and does not run on ordinary code pushes.
- Actual user acceptance: launch without installer/admin, log into ChatGPT, copy a response, start read-only supervision, try stopping and restarting, and ensure NightNova-Data stays beside the EXE.
- A successful CI build verifies typing/tests/packaging, not the complete real Windows UI or any upstream login service.
