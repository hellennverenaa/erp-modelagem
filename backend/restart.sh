#!/bin/bash
# ════════════════════════════════════════════════════════════════
# restart.sh — Hot-Restart seguro do Backend ERP Modelagem
# Uso: bash restart.sh
# ════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=3001

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ERP Backend — Protocolo de Restart Limpo"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Passo 1: Derrubar processo na porta 3001 (se existir)
PID=$(lsof -ti :$PORT 2>/dev/null || true)
if [ -n "$PID" ]; then
  echo "[1/3] Finalizando processo anterior (PID $PID) na porta $PORT..."
  kill -9 $PID 2>/dev/null || true
  sleep 1
  echo "      Processo finalizado."
else
  echo "[1/3] Nenhum processo ativo na porta $PORT."
fi

# Passo 2: Rebuild TypeScript -> dist/
echo "[2/3] Compilando TypeScript (npm run build)..."
cd "$SCRIPT_DIR"
npm run build

echo "      Build concluído. Verificando métodos críticos em dist/:"
grep -n "getModelos\|getPlantas\|updateUsuarioPerfil\|updatePermissoes" dist/controllers/admin.controller.js | \
  awk '{printf "      %-6s %s\n", $1, $2}'

# Passo 3: Iniciar servidor em background
echo "[3/3] Iniciando servidor via node dist/server.js..."
nohup node dist/server.js > /tmp/erp-backend.log 2>&1 &
NEW_PID=$!

sleep 3

# Verificar se o servidor subiu
if lsof -ti :$PORT > /dev/null 2>&1; then
  echo ""
  echo "  Servidor rodando com sucesso!"
  echo "  PID: $(lsof -ti :$PORT)"
  echo "  URL: http://localhost:$PORT"
  echo "  API: http://localhost:$PORT/api-docs"
  echo "  Log: /tmp/erp-backend.log"
else
  echo ""
  echo "  ERRO: Servidor não subiu. Verifique o log:"
  echo "  tail -50 /tmp/erp-backend.log"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
