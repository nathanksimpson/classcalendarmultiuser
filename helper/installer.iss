; Compile with Inno Setup 6 on a developer PC. Teachers do not install Inno Setup.
[Setup]
AppId=ClassManagerSyncHelper
AppName=ClassManager Sync Helper
AppVersion=1.0.0
AppVerName=ClassManager Sync Helper
AppPublisher=ClassManager
DefaultDirName={localappdata}\ClassManagerSync
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
OutputDir=build
OutputBaseFilename=ClassManagerSyncSetup
Compression=lzma2
SolidCompression=yes
UninstallDisplayName=ClassManager Sync Helper

[Files]
Source: "build\ClassManagerSync.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "launch-hidden.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "certs\tms-intermediate.pem"; DestDir: "{app}\certs"; Flags: ignoreversion

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "ClassManagerSync"; ValueData: "wscript.exe ""{app}\launch-hidden.vbs"""; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\classmanager-sync"; ValueType: string; ValueName: ""; ValueData: "URL:ClassManager Sync Helper"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\classmanager-sync"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\classmanager-sync\shell\open\command"; ValueType: string; ValueName: ""; ValueData: "wscript.exe ""{app}\launch-hidden.vbs"" ""%1"""

[Run]
Filename: "wscript.exe"; Parameters: """{app}\launch-hidden.vbs"""; Flags: nowait runhidden
Filename: "http://127.0.0.1:8765/"; Flags: shellexec postinstall nowait; Description: "Check that the helper is running"

[UninstallRun]
Filename: "taskkill"; Parameters: "/IM ClassManagerSync.exe /F"; Flags: runhidden; RunOnceId: "KillHelper"
