# Relatório de Debug — Falha na Renderização de CSS (Tailwind v4 vs v3)

Este relatório apresenta o diagnóstico sistemático da falha que causou a ausência de estilos (HTML puro) no frontend da aplicação, seguindo o protocolo de 5 passos.

---

## 1. Isolamento da Falha (Isolate)

- **Comportamento Esperado**: A aplicação deve compilar e injetar as classes utilitárias do Tailwind CSS no navegador.
- **Comportamento Observado**: A página é renderizada como HTML puro, sem estilos. O arquivo CSS principal é carregado vazio ou com tamanho quase nulo.
- **Ambiente**: O servidor de desenvolvimento Vite (`npm run dev`) está rodando há mais de 4 horas. Um teste de build de produção (`npm run build`) foi executado e **sucedeu perfeitamente**, gerando o bundle de CSS compilado com 31.97 kB.

---

## 2. Investigação Técnica (Log & Repr)

1. **Imports Principais**:
   - `frontend/src/main.ts` importa corretamente `import './index.css'`.
   - `frontend/src/index.css` contém a diretiva padrão do Tailwind v4: `@import "tailwindcss";`.
2. **Configuração do Vite**:
   - `frontend/vite.config.ts` injeta o plugin `@tailwindcss/vite` na ordem correta:
     ```typescript
     plugins: [
       tailwindcss(),
       vue()
     ]
     ```
3. **Teste de Servidor Paralelo**:
   - Iniciamos um servidor Vite de diagnóstico na porta `5176` para capturar a saída limpa. O servidor inicializou sem erros de sintaxe ou compilação, mas disparou o log:
     `[vite] (client) Re-optimizing dependencies because vite config has changed`

---

## 3. Causa Raiz (The "Why")

A falha de compilação do CSS no ambiente de desenvolvimento é decorrente de um **desalinhamento de cache de otimização de dependências do Vite (HMR Dependency Lock)**.

Ao executarmos a instalação das novas dependências (`gsap` e `lucide-vue-next`), o arquivo `package.json` foi alterado. O processo do servidor de desenvolvimento Vite (PID `47113`), que já estava em execução há várias horas, **não conseguiu invalidar e re-otimizar o cache de dependências de forma dinâmica**. 
Como consequência:
- O Vite falhou em resolver internamente o import de `@import "tailwindcss";` no arquivo `index.css` em tempo de execução.
- O servidor passou a servir o arquivo CSS em desenvolvimento como vazio ou não compilado.

> [!NOTE]
> O "Modo TV" ou o overlay fullscreen no Vue não alteram as diretivas globais de CSS, logo não são a causa raiz do problema de renderização global de estilos.

---

## 4. Plano de Ação Proposto

Apresentamos duas alternativas para restabelecer a estabilidade visual:

### Opção A: Corrigir a Infraestrutura do Tailwind v4 (Recomendado)
Considerando que a build de produção funciona perfeitamente com a infraestrutura v4 atual, a correção no ambiente de desenvolvimento é simples:
1. **Derrubar o processo atual do Vite** (PID `47113`) no terminal do sistema.
2. **Limpar a pasta de cache do Vite**: excluir `frontend/node_modules/.vite`.
3. **Iniciar novamente o servidor de desenvolvimento**: `npm run dev`.
4. Limpar o cache do navegador e atualizar a página.

### Opção B: Downgrade para Tailwind CSS v3
Caso prefira retornar para a arquitetura tradicional estável com arquivos de configuração separados:
1. Desinstalar `@tailwindcss/vite` e `tailwindcss` (v4).
2. Instalar `tailwindcss@3`, `postcss` e `autoprefixer`.
3. Criar o arquivo `tailwind.config.js` com o escopo de varredura de arquivos Vue:
   ```javascript
   module.exports = {
     content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
     theme: { extend: {} },
     plugins: [],
   }
   ```
4. Criar o arquivo `postcss.config.js`:
   ```javascript
   module.exports = {
     plugins: {
       tailwindcss: {},
       autoprefixer: {},
     }
   }
   ```
5. Alterar `frontend/src/index.css` para as diretivas tradicionais:
   ```css
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```
6. Remover `tailwindcss` de `vite.config.ts`.
