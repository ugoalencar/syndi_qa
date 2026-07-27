' Roda o executor unico (launcher.js) sem janela de terminal - e o alvo do atalho
' "Syndi_qa" da area de trabalho. Resolve a propria pasta, entao continua funcionando
' se a pasta for copiada pra outro lugar/computador.

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
pastaScript = fso.GetParentFolderName(WScript.ScriptFullName)

comando = "cmd /c cd /d """ & pastaScript & """ && (if not exist logs mkdir logs) && node launcher.js >> logs\launcher-boot.log 2>&1"
WshShell.Run comando, 0, False
