/* NFCWORK — dossier d'installation de la caisse, prêt pour un client (clé USB)
   NFCW_CAISSE_USB.telecharger({ nom, slug }) → télécharge Caisse-<slug>.zip :
   Windows (double-clic, aucune question) + Mac + LISEZ-MOI, déjà réglés sur nfcwork.ma/espace/pos.html#m=<slug>. */
(function () {
  "use strict";
  // --- ZIP minimal (fichiers stockés sans compression) ---
  const TBL = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TBL[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    const d = new Date(), dt = ((d.getFullYear() - 1980) << 25) | ((d.getMonth() + 1) << 21) | (d.getDate() << 16) | (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint32(10, dt, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 0x0314, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(12, dt, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(38, ((f.exec ? 0o100755 : 0o100644) << 16) >>> 0, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    }
    const cs = central.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
  }
  const crlf = s => s.replace(/\r?\n/g, "\r\n");
  const ps = s => String(s).replace(/'/g, "''");
  const sh = s => String(s).replace(/[^\w .&éèàçâêîôûÉ'-]/g, "").replace(/'/g, "");

  function fichiers(nom, slug, ico, icns) {
    const url = "https://nfcwork.ma/espace/pos.html#m=" + slug, N = nom.replace(/[\\/:*?"<>|]/g, "").trim() || "Caisse";
    const win = `# Caisse ${N} - installation automatique (NFCWORK)
$ErrorActionPreference = 'Stop'
$nom = '${ps(N)}'
$url = '${ps(url)}'
$profil = Join-Path $env:LOCALAPPDATA 'NFCWORK-Caisse'
$dossier = Join-Path $env:LOCALAPPDATA 'NFCWORK'
Write-Host ''
Write-Host "  Installation de la caisse : $nom" -ForegroundColor Cyan
$candidats = @("$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe","\${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe","$env:LOCALAPPDATA\\Google\\Chrome\\Application\\chrome.exe","\${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe","$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe")
$nav = $candidats | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $nav) { Write-Host '  Installez Google Chrome puis relancez.' -ForegroundColor Red; Start-Process 'https://www.google.com/chrome/'; Read-Host '  Entree'; exit 1 }
New-Item -ItemType Directory -Force -Path $dossier | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot 'caisse.ico') (Join-Path $dossier 'caisse.ico')
$arg = "--app=\`"$url\`" --kiosk-printing --user-data-dir=\`"$profil\`" --no-first-run --disable-features=Translate --autoplay-policy=no-user-gesture-required"
$w = New-Object -ComObject WScript.Shell
foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Startup'))) {
  Get-ChildItem $d -Filter '*.lnk' -ErrorAction SilentlyContinue | Where-Object { $w.CreateShortcut($_.FullName).Arguments -like '*NFCWORK-Caisse*' } | Remove-Item -Force
  $s = $w.CreateShortcut((Join-Path $d "$nom.lnk")); $s.TargetPath = $nav; $s.Arguments = $arg; $s.IconLocation = (Join-Path $dossier 'caisse.ico'); $s.Description = "Caisse $nom"; $s.WorkingDirectory = $dossier; $s.Save()
}
try { powercfg /change monitor-timeout-ac 0; powercfg /change standby-timeout-ac 0 } catch {}
Write-Host "  OK ! Icone \`"$nom\`" sur le bureau. Ouverture..." -ForegroundColor Green
Start-Process -FilePath $nav -ArgumentList $arg
Start-Sleep -Seconds 3
`;
    const bat = `@echo off\ntitle Installation - Caisse ${N.replace(/[%&|<>^]/g, "")}\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer.ps1"\n`;
    const des = `@echo off\npowershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; foreach($d in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Startup'))){ Get-ChildItem $d -Filter '*.lnk' -ErrorAction SilentlyContinue | Where-Object { $w.CreateShortcut($_.FullName).Arguments -like '*NFCWORK-Caisse*' } | Remove-Item -Force }; Write-Host 'Caisse retiree.'"\npause\n`;
    const M = sh(N) || "Caisse";
    const mac = `#!/bin/bash
# Caisse ${M} - installation Mac (NFCWORK)
NOM='${M}'
URL='${url}'
PROFIL="$HOME/Library/Application Support/NFCWORK-Caisse"
if [ -d "/Applications/Google Chrome.app" ]; then NAV="Google Chrome"; elif [ -d "/Applications/Microsoft Edge.app" ]; then NAV="Microsoft Edge"; else open "https://www.google.com/chrome/"; echo "Installez Google Chrome puis relancez."; exit 1; fi
APP="/Applications/$NOM.app"; rm -rf "$APP"
osacompile -o "$APP" -e "do shell script \\"open -na '$NAV' --args --app='$URL' --kiosk-printing --user-data-dir='$PROFIL' --no-first-run --autoplay-policy=no-user-gesture-required\\"" || exit 1
DIR="$(cd "$(dirname "$0")" && pwd)"; [ -f "$DIR/caisse.icns" ] && cp "$DIR/caisse.icns" "$APP/Contents/Resources/applet.icns" && touch "$APP"
osascript -e "tell application \\"System Events\\" to make login item at end with properties {path:\\"$APP\\", hidden:false}" >/dev/null 2>&1
echo "OK ! Application \\"$NOM\\" installee."; open "$APP"
`;
    const lin = `#!/bin/bash
# Caisse ${M} - installation Linux (NFCWORK)
URL='${url}'
NAV="$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser || command -v microsoft-edge)"
[ -z "$NAV" ] && { xdg-open "https://www.google.com/chrome/"; echo "Installez Google Chrome puis relancez."; exit 1; }
DIR="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$HOME/.local/share/applications" "$HOME/.config/autostart" "$HOME/.local/share/nfcwork"
cp "$DIR/caisse.ico" "$HOME/.local/share/nfcwork/caisse.ico" 2>/dev/null
F="[Desktop Entry]\nType=Application\nName=${M}\nExec=$NAV --app=$URL --kiosk-printing --user-data-dir=$HOME/.config/nfcwork-caisse --no-first-run --autoplay-policy=no-user-gesture-required\nIcon=$HOME/.local/share/nfcwork/caisse.ico\nTerminal=false\n"
for D in "$HOME/.local/share/applications" "$HOME/.config/autostart" "$(xdg-user-dir DESKTOP 2>/dev/null || echo $HOME/Desktop)"; do printf "$F" > "$D/nfcwork-caisse.desktop"; chmod +x "$D/nfcwork-caisse.desktop"; done
echo "OK ! Caisse installee."; nohup "$NAV" --app="$URL" --kiosk-printing --user-data-dir="$HOME/.config/nfcwork-caisse" --no-first-run >/dev/null 2>&1 &
`;
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Caisse ${N.replace(/</g, "")}</title>
<meta http-equiv="refresh" content="1;url=${url}"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#040a1d;color:#fff;font:600 20px system-ui,sans-serif;text-align:center;padding:20px}a{color:#5cc8ff}</style></head>
<body><div>🧾 Ouverture de la caisse…<br><br><a href="${url}">Toucher ici si rien ne se passe</a><br><br><small style="font-weight:400;color:#a7b6d9">Tablette : ensuite menu ⋮ du navigateur → « Ajouter à l’écran d’accueil » / « Installer l’application ».</small></div>
<script>location.replace(${JSON.stringify(url)})</script></body></html>`;
    const lisez = `CAISSE ${N.toUpperCase()} - installation
====================================

WINDOWS
1. Imprimante ticket branchee et "par defaut".
2. Double-cliquez sur INSTALLER-WINDOWS.bat  -> c'est tout.
   Si "Windows a protege votre ordinateur" : Informations complementaires > Executer quand meme.
3. Premiere ouverture : connectez-vous avec l'e-mail de la caisse.

MAC
Terminal : tapez  bash  + espace, glissez INSTALLER-MAC.command dans la fenetre, Entree.

TABLETTE / CAISSE ANDROID (Sunmi, Imin, Samsung...) / iPad / TOUT AUTRE APPAREIL
Ouvrez OUVRIR-LA-CAISSE.html (ou scannez le QR donne par NFCWORK),
puis dans le navigateur : "Installer l'application" / "Ajouter a l'ecran d'accueil".
iPad : bouton Partager > "Sur l'ecran d'accueil".

LINUX
Terminal : bash INSTALLER-LINUX.sh

La caisse s'ouvre seule au demarrage, imprime directement et continue sans internet.
Aide NFCWORK : WhatsApp 06 20 66 60 27
`;
    const D = "Caisse-" + slug + "/";
    return [
      { name: D + "INSTALLER-WINDOWS.bat", data: crlf(bat) },
      { name: D + "installer.ps1", data: new Uint8Array([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode(crlf(win))]) },
      { name: D + "DESINSTALLER-WINDOWS.bat", data: crlf(des) },
      { name: D + "INSTALLER-MAC.command", data: mac, exec: true },
      { name: D + "LISEZ-MOI.txt", data: crlf(lisez) },
      { name: D + "OUVRIR-LA-CAISSE.html", data: html },
      { name: D + "INSTALLER-LINUX.sh", data: lin, exec: true },
      ...(ico ? [{ name: D + "caisse.ico", data: ico }] : []),
      ...(icns ? [{ name: D + "caisse.icns", data: icns }] : [])
    ];
  }
  async function octets(u) { try { const r = await fetch(u); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } catch (e) { return null; } }
  async function telecharger({ nom, slug }) {
    const [ico, icns] = await Promise.all([octets("../assets/caisse/caisse.ico"), octets("../assets/caisse/caisse.icns")]);
    const b = zip(fichiers(nom, slug, ico, icns));
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "Caisse-" + slug + ".zip";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  window.NFCW_CAISSE_USB = { telecharger, _fichiers: fichiers, _zip: zip };
})();
