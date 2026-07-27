' Cria um atalho "Syndi_qa" na Area de Trabalho apontando para ESTE pacote,
' onde quer que ele tenha sido copiado. Basta dar um duplo-clique neste arquivo.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

pasta = fso.GetParentFolderName(WScript.ScriptFullName)
desktop = sh.SpecialFolders("Desktop")

Set lnk = sh.CreateShortcut(desktop & "\Syndi_qa.lnk")
lnk.TargetPath = "wscript.exe"
lnk.Arguments = """" & pasta & "\iniciar-tudo.vbs"""
lnk.WorkingDirectory = pasta
lnk.IconLocation = "C:\Windows\System32\imageres.dll,105"
lnk.Description = "Inicia o Syndi_qa (servidor e interface)"
lnk.Save

MsgBox "Pronto! O atalho 'Syndi_qa' foi criado na Area de Trabalho." & vbCrLf & _
       "Use ele pra ligar o Syndi_qa.", _
       64, "Syndi_qa"
