Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
arg = ""
If WScript.Arguments.Count > 0 Then
  arg = LCase(WScript.Arguments(0))
End If
If InStr(arg, "uninstall") > 0 Then
  unins = folder & "\unins000.exe"
  If fso.FileExists(unins) Then
    shell.Run """" & unins & """", 1, False
  End If
Else
  shell.Run """" & folder & "\ClassManagerSync.exe""", 0, False
End If
