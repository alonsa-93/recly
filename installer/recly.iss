; Recly installer (Inno Setup 6). Per-user install: no admin prompt.
; Build:  ISCC.exe installer\recly.iss   -> installer\out\Recly-Setup-<version>.exe
; The setup is unsigned: SmartScreen warns, and Windows 11 Smart App Control blocks it outright
; (error 4551 on the extracted setup engine). The portable ZIP works there; a code-signing
; certificate is the only fix for the installer.

#define AppVer "1.0.0"

[Setup]
AppId={{A8C18F65-6EE6-456E-AC58-F27F3C192798}
AppName=Recly
AppVersion={#AppVer}
AppVerName=Recly {#AppVer}
AppPublisher=Recly
AppPublisherURL=https://github.com/alonsa-93/recly
AppSupportURL=https://github.com/alonsa-93/recly/issues
AppComments=Record locally. Stay yours.
VersionInfoVersion={#AppVer}
VersionInfoDescription=Recly setup
PrivilegesRequired=lowest
DefaultDirName={autopf}\Recly
DisableProgramGroupPage=yes
DisableDirPage=auto
SetupIconFile=..\recly.ico
UninstallDisplayIcon={app}\recly.ico
UninstallDisplayName=Recly
OutputDir=out
OutputBaseFilename=Recly-Setup-{#AppVer}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=no

[Languages]
Name: "hebrew"; MessagesFile: "compiler:Languages\Hebrew.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\asr-worker.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\sw.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\manifest.webmanifest"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\recly.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\start.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\server.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\THIRD-PARTY-NOTICES.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\fonts\*"; DestDir: "{app}\fonts"; Flags: ignoreversion
Source: "..\icons\*"; DestDir: "{app}\icons"; Flags: ignoreversion
Source: "..\vendor\transformers\*"; DestDir: "{app}\vendor\transformers"; Flags: ignoreversion

[InstallDelete]
; The app used to be called Recordo.
Type: files; Name: "{autodesktop}\Recordo.lnk"
Type: files; Name: "{autoprograms}\Recordo.lnk"

; Shortcuts open the signed powershell.exe directly: Smart App Control blocks shortcuts to a .bat.
#define PS "{sys}\WindowsPowerShell\v1.0\powershell.exe"

[Icons]
Name: "{autoprograms}\Recly"; Filename: "{#PS}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File ""{app}\server.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\recly.ico"; Comment: "Recly - record locally. Stay yours."; Flags: runminimized
Name: "{autodesktop}\Recly"; Filename: "{#PS}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File ""{app}\server.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\recly.ico"; Comment: "Recly - record locally. Stay yours."; Flags: runminimized; Tasks: desktopicon

[Run]
Filename: "{#PS}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File ""{app}\server.ps1"""; WorkingDir: "{app}"; Description: "{cm:LaunchProgram,Recly}"; Flags: postinstall nowait skipifsilent runminimized
