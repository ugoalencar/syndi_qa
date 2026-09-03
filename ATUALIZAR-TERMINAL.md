# 🔄 Instruções para Atualizar Terminal (C:\syndi_qa)

**Se atualizacao.bat não funcionou**, use este procedimento manual:

---

## ⚠️ ANTES DE COMEÇAR

Certifique-se que:
- ✅ Tem acesso à internet
- ✅ Git está instalado (`git --version`)
- ✅ Pode acessar GitHub (sem firewall bloqueando)

---

## 🔧 Método 1: Via Powershell (RECOMENDADO)

```powershell
# Abra PowerShell como ADMINISTRADOR

# 1. Vá para a pasta
cd C:\syndi_qa

# 2. Pare o servidor
taskkill /F /IM node.exe

# 3. Limpe cache de git (caso haja conflict)
git reset --hard

# 4. Atualize do GitHub
git pull origin main

# 5. Verifique os commits chegaram
git log --oneline -5

# 6. Reinicie o servidor
.\iniciar-server.bat
```

---

## 🔧 Método 2: Duplo-clique em atualizacao.bat

1. Abra **Explorador de Arquivos**
2. Navegue até **C:\syndi_qa**
3. Duplo-clique em **atualizacao.bat**
4. Aguarde a mensagem "Atualização concluída!"

---

## 🔧 Método 3: Terminal (CMD)

```batch
cd C:\syndi_qa
call atualizacao.bat
```

---

## ✅ Como Verificar se Funcionou

### Após atualizar, execute:

```bash
git log --oneline -1
```

**Deve mostrar um de:**
```
edb925f docs: fluxo completo Pescador + Verificador + documentação
c32a8b9 feat: integra Pescador de GTIN na interface syndi_qa
51f9f18 refactor: syndi_qa passa a monitorar apenas OS_NONE, Pescador isolado
8ff8ae4 feat: Pescador de GTIN isolado com pause/resume e estado persistido
```

### No navegador:

1. Abra http://localhost:3001
2. Pressione **Ctrl + Shift + R** (hard refresh)
3. Clique em "Mostrar OS_NONE"
4. Procure pelos botões no topo:
   - 🔵 **Pescador de GTIN** (azul claro)
   - 🟡 **Verificar/Organizar** (amarelo)
   - 🔄 **Recarregar** (primeira linha)

---

## ❌ Se Ainda Não Funcionar

### Checklist de Debug:

```bash
# 1. Verificar status git
cd C:\syndi_qa
git status
git branch -vv

# 2. Verificar conectividade GitHub
git remote -v

# 3. Forçar atualização (⚠️ descarta mudanças locais)
git fetch origin main
git reset --hard origin/main

# 4. Verificar se servidor rodando
netstat -ano | findstr :3001

# 5. Reiniciar servidor
taskkill /F /IM node.exe
timeout /t 2
node server.js
```

---

## 📋 Arquivos que Devem Aparecer Após Atualizar

```
C:\syndi_qa\
├── pescador-gtin.bat           ← NOVO
├── pescador-gtin.js            ← NOVO
├── lib/pescador.js             ← NOVO
├── diagnostico-pescador.js     ← NOVO
├── FLUXO-PESCADOR-QA.md        ← NOVO
├── syndi_qa.html               ← ATUALIZADO (com botão Pescador)
├── js/qa.js                    ← ATUALIZADO
└── server.js                   ← ATUALIZADO
```

Se esses arquivos aparecerem, a atualização funcionou! ✅

---

## 🆘 Ainda com Problema?

Se nada funcionar, pode ser:
1. **Problema de rede** - Teste: `ping github.com`
2. **Autenticação Git** - Configure: `git config --global user.email` + `user.name`
3. **Firewall corporativo** - Pode estar bloqueando GitHub
4. **Repositório corrompido** - Delete C:\syndi_qa e clone de novo:
   ```bash
   cd C:\
   git clone https://github.com/ugoalencar/syndi_qa.git
   cd syndi_qa
   .\iniciar-server.bat
   ```

---

**Data de Atualização:** 2026-09-03  
**Versão:** 1.0  
**Commits inclusos:** edb925f, c32a8b9, 51f9f18, 8ff8ae4
