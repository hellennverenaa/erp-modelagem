import { AppDataSource } from '../config/database';
import { OrdemTeste } from '../entities/OrdemTeste';
import { Rastreamento } from '../entities/Rastreamento';
import { Checklist } from '../entities/Checklist';
import { OcorrenciaProducao } from '../entities/OcorrenciaProducao';
import { Inspecao } from '../entities/Inspecao';
import { DossieModelo, DossieStatus } from '../entities/DossieModelo';
import puppeteer, { Browser } from 'puppeteer';
import path from 'path';
import fs from 'fs';

/**
 * Monta o HTML com os dados consolidados do teste para renderização no PDF
 */
function generateDossieHtml(
  testOrder: OrdemTeste,
  rastreamentos: Rastreamento[],
  checklists: Checklist[],
  ocorrencias: OcorrenciaProducao[],
  inspecoes: Inspecao[]
): string {
  // Capa e identificação
  const capHtml = `
    <div class="section capa">
      <h1>DOSSIÊ COMPILADO DO MODELO</h1>
      <h2>Ordem de Teste: ${testOrder.codigoBarras}</h2>
      <hr/>
      <table class="info-table">
        <tr>
          <td><strong>Modelo:</strong> ${testOrder.modelo?.nome || 'N/A'}</td>
          <td><strong>Código Produto:</strong> ${testOrder.modelo?.codigoProduto || 'N/A'}</td>
        </tr>
        <tr>
          <td><strong>Marca:</strong> ${testOrder.modelo?.marca?.nome || 'N/A'}</td>
          <td><strong>Prioridade PCP:</strong> ${testOrder.prioridadePcp || 'N/A'}</td>
        </tr>
        <tr>
          <td><strong>Status Atual:</strong> ${testOrder.status}</td>
          <td><strong>Possui Caixa Teste:</strong> ${testOrder.possuiCaixaTeste ? 'Sim' : 'Não'}</td>
        </tr>
        <tr>
          <td><strong>Data Início:</strong> ${testOrder.dataInicio ? new Date(testOrder.dataInicio).toLocaleDateString('pt-BR') : 'N/A'}</td>
          <td><strong>Data Fim Real:</strong> ${testOrder.dataFimReal ? new Date(testOrder.dataFimReal).toLocaleDateString('pt-BR') : 'N/A'}</td>
        </tr>
      </table>
      ${testOrder.observacoes ? `<p><strong>Observações da Ordem:</strong> ${testOrder.observacoes}</p>` : ''}
    </div>
  `;

  // Rastreamento/Rota real
  const rastRows = rastreamentos.map(r => `
    <tr>
      <td>${r.setor?.nome || 'N/A'}</td>
      <td>${r.tipoLote}</td>
      <td>${r.dataEntrada ? new Date(r.dataEntrada).toLocaleString('pt-BR') : '-'}</td>
      <td>${r.dataSaida ? new Date(r.dataSaida).toLocaleString('pt-BR') : 'Em Processo'}</td>
      <td>${r.tempoPermanenciaMin !== null ? `${r.tempoPermanenciaMin} min` : '-'}</td>
      <td>${r.status}</td>
    </tr>
  `).join('');

  const rastHtml = `
    <div class="section">
      <h3>1. Rota de Produção Executada</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Setor</th>
            <th>Lote</th>
            <th>Entrada</th>
            <th>Saída</th>
            <th>Permanência (SLA)</th>
            <th>Status Bipagem</th>
          </tr>
        </thead>
        <tbody>
          ${rastRows.length ? rastRows : '<tr><td colspan="6" style="text-align:center;">Nenhum rastreamento registrado.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  // Checklists
  const chkHtml = checklists.map(c => {
    const itemRows = c.itens.map(it => `
      <tr>
        <td>${it.templateItem?.descricao || it.descricaoAvulsa || 'Item Avulso'}</td>
        <td style="text-align: center;">${it.conforme ? '✅' : '❌'}</td>
        <td>${it.valorResposta || '-'}</td>
        <td>${it.observacao || '-'}</td>
      </tr>
    `).join('');
    return `
      <div class="checklist-box">
        <h4>Setor: ${c.setor?.nome || 'N/A'} (Preenchido por: ${c.preenchidoPor?.nomeCompleto || 'N/A'})</h4>
        <p><strong>Status:</strong> ${c.status} | <strong>Data:</strong> ${c.dataPreenchimento ? new Date(c.dataPreenchimento).toLocaleString('pt-BR') : 'N/A'}</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>Item de Verificação</th>
              <th style="width: 80px; text-align: center;">Conforme</th>
              <th>Resposta</th>
              <th>Observação</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows.length ? itemRows : '<tr><td colspan="4" style="text-align:center;">Nenhum item respondido.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  const checklistsHtml = `
    <div class="section">
      <h3>2. Checklists de Conferência</h3>
      ${chkHtml.length ? chkHtml : '<p>Nenhum checklist preenchido para esta ordem.</p>'}
    </div>
  `;

  // Ocorrências e Gargalos
  const ocRows = ocorrencias.map(o => `
    <tr>
      <td>${o.setor?.nome || 'N/A'}</td>
      <td><strong>${o.titulo}</strong><br/>${o.descricao}</td>
      <td>${o.tipoOcorrencia}</td>
      <td>${o.gravidade}</td>
      <td>${o.status}</td>
      <td>${o.dataOcorrencia ? new Date(o.dataOcorrencia).toLocaleString('pt-BR') : '-'}</td>
      <td>${o.dataResolucao ? new Date(o.dataResolucao).toLocaleString('pt-BR') : '-'}</td>
    </tr>
  `).join('');

  const ocorrenciasHtml = `
    <div class="section">
      <h3>3. Ocorrências e Gargalos de Produção</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Setor</th>
            <th>Descrição do Evento</th>
            <th>Tipo</th>
            <th>Gravidade</th>
            <th>Status</th>
            <th>Data Ocorrência</th>
            <th>Data Resolução</th>
          </tr>
        </thead>
        <tbody>
          ${ocRows.length ? ocRows : '<tr><td colspan="7" style="text-align:center;">Nenhuma ocorrência registrada.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  // Histórico de qualidade (Inspeções)
  const inspRows = inspecoes.map(i => `
    <tr>
      <td>${i.setor?.nome || 'N/A'}</td>
      <td>${i.tipoInspecao}</td>
      <td>${i.tipoLote}</td>
      <td style="font-weight: bold; color: ${i.resultado === 'REPROVADO' ? '#d9534f' : '#5cb85c'};">${i.resultado}</td>
      <td>${i.inspetor?.nomeCompleto || 'N/A'}</td>
      <td>${i.dataInspecao ? new Date(i.dataInspecao).toLocaleString('pt-BR') : '-'}</td>
      <td>${i.observacoes || '-'}</td>
    </tr>
  `).join('');

  const inspecoesHtml = `
    <div class="section">
      <h3>4. Histórico de Qualidade (Gates e Inspeções)</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Setor</th>
            <th>Tipo Inspeção</th>
            <th>Lote</th>
            <th>Resultado</th>
            <th>Inspetora</th>
            <th>Data Inspecao</th>
            <th>Observações</th>
          </tr>
        </thead>
        <tbody>
          ${inspRows.length ? inspRows : '<tr><td colspan="7" style="text-align:center;">Nenhuma inspeção de qualidade registrada.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          color: #333;
          line-height: 1.4;
          font-size: 11px;
          margin: 30px;
          background: #fff;
        }
        h1, h2, h3, h4 {
          color: #0b3c5d;
          margin-top: 0;
        }
        h1 {
          font-size: 20px;
          text-align: center;
          margin-bottom: 5px;
          letter-spacing: 1px;
        }
        h2 {
          font-size: 14px;
          text-align: center;
          color: #555;
          margin-bottom: 20px;
        }
        h3 {
          font-size: 13px;
          border-bottom: 2px solid #0b3c5d;
          padding-bottom: 5px;
          margin-top: 25px;
          margin-bottom: 12px;
          text-transform: uppercase;
        }
        h4 {
          font-size: 11px;
          margin-bottom: 5px;
          color: #328cc1;
        }
        hr {
          border: 0;
          border-top: 1px solid #0b3c5d;
          margin-bottom: 20px;
        }
        .section {
          margin-bottom: 25px;
          page-break-inside: avoid;
        }
        .capa {
          border: 2px solid #0b3c5d;
          padding: 25px;
          border-radius: 8px;
          background-color: #f7f9fb;
          margin-bottom: 30px;
        }
        .info-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
        }
        .info-table td {
          padding: 6px;
          font-size: 11px;
          width: 50%;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
          margin-bottom: 12px;
        }
        .data-table th, .data-table td {
          border: 1px solid #e0e0e0;
          padding: 8px;
          text-align: left;
        }
        .data-table th {
          background-color: #0b3c5d;
          color: #fff;
          font-weight: bold;
          font-size: 10px;
          text-transform: uppercase;
        }
        .data-table tr:nth-child(even) {
          background-color: #f9fafb;
        }
        .checklist-box {
          margin-bottom: 15px;
          padding: 10px;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          background: #fff;
          page-break-inside: avoid;
        }
        .checklist-box p {
          margin: 0 0 8px 0;
          font-size: 10px;
          color: #666;
        }
        .footer-note {
          text-align: center;
          font-size: 9px;
          color: #999;
          margin-top: 40px;
          border-top: 1px solid #e0e0e0;
          padding-top: 10px;
        }
      </style>
    </head>
    <body>
      ${capHtml}
      ${rastHtml}
      ${checklistsHtml}
      ${ocorrenciasHtml}
      ${inspecoesHtml}
      <div class="footer-note">
        ERP Dass de Modelagem de Calçados — Relatório de Dossiê Técnico do Modelo.
      </div>
    </body>
    </html>
  `;
}

/**
 * Coleta os dados do banco e aciona o Puppeteer para converter em PDF de forma offline
 */
export async function processarGeracaoDossie(dossieId: string): Promise<void> {
  const dossieRepo = AppDataSource.getRepository(DossieModelo);
  const checklistRepo = AppDataSource.getRepository(Checklist);
  const occurrenceRepo = AppDataSource.getRepository(OcorrenciaProducao);
  const inspecaoRepo = AppDataSource.getRepository(Inspecao);
  const trackingRepo = AppDataSource.getRepository(Rastreamento);

  let browser: Browser | null = null;
  const startTime = Date.now();

  try {
    // 1. Busca o registro do Dossiê no banco
    const dossie = await dossieRepo.findOne({
      where: { id: dossieId },
      relations: {
        ordemTeste: { modelo: { marca: true } }
      }
    });

    if (!dossie) {
      console.error(`[DossieService] Dossiê com ID ${dossieId} não encontrado.`);
      return;
    }

    const { ordemTesteId } = dossie;
    const testOrder = dossie.ordemTeste;

    // 2. Coleta dados consolidados no banco de dados local
    const rastreamentos = await trackingRepo.find({
      where: { ordemTesteId },
      relations: { setor: true },
      order: { dataEntrada: 'ASC' }
    });

    const checklists = await checklistRepo.find({
      where: { ordemTesteId },
      relations: {
        itens: { templateItem: true },
        setor: true,
        preenchidoPor: true
      },
      order: { dataPreenchimento: 'ASC' }
    });

    const ocorrencias = await occurrenceRepo.find({
      where: { ordemTesteId },
      relations: {
        setor: true,
        reportadoPor: true
      },
      order: { dataOcorrencia: 'ASC' }
    });

    const inspecoes = await inspecaoRepo.find({
      where: { ordemTesteId },
      relations: {
        setor: true,
        inspetor: true
      },
      order: { dataInspecao: 'ASC' }
    });

    // 3. Define diretório de destino (com fallback seguro para local)
    const uploadDir = process.env.NODE_ENV === 'production'
      ? (process.env.UPLOAD_DIR || '/app/uploads')
      : path.join(process.cwd(), 'uploads');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const fileName = `dossie_${ordemTesteId}.pdf`;
    const fullPath = path.join(uploadDir, fileName);

    // 4. Cria HTML com Template Literals
    const htmlContent = generateDossieHtml(testOrder, rastreamentos, checklists, ocorrencias, inspecoes);

    // 5. Executa Puppeteer para converter HTML -> PDF (com argumentos anti-sandbox para Docker)
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'load' });

    await page.pdf({
      path: fullPath,
      format: 'A4',
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '20mm',
        right: '20mm'
      },
      printBackground: true
    });

    // 6. Calcula o tamanho do arquivo gerado
    const stats = fs.statSync(fullPath);
    const duration = Date.now() - startTime;

    // 7. Atualiza o registro do Dossiê para CONCLUIDO
    dossie.status = DossieStatus.CONCLUIDO;
    dossie.caminhoPdf = fullPath;
    dossie.tamanhoBytes = stats.size;
    dossie.geradoEm = new Date();
    dossie.metadadosCompilacao = {
      durationMs: duration,
      sectionsCount: 5,
      sectionsIncluded: ['capa', 'rastreamentos', 'checklists', 'ocorrencias', 'inspecoes']
    };

    await dossieRepo.save(dossie);
    console.log(`[DossieService] Dossiê gerado e concluído com sucesso: ${fullPath} (${stats.size} bytes)`);

  } catch (error: any) {
    console.error(`[DossieService] Falha ao gerar dossiê para ID ${dossieId}:`, error);

    // Atualiza status do Dossiê para ERRO
    try {
      const dossie = await dossieRepo.findOne({ where: { id: dossieId } });
      if (dossie) {
        dossie.status = DossieStatus.ERRO;
        dossie.metadadosCompilacao = {
          error: error.message || String(error),
          durationMs: Date.now() - startTime
        };
        await dossieRepo.save(dossie);
      }
    } catch (dbErr) {
      console.error('[DossieService] Erro ao salvar status de falha do dossiê no banco:', dbErr);
    }
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.error('[DossieService] Erro ao fechar browser do Puppeteer:', closeErr);
      }
    }
  }
}

/**
 * Wrapper assíncrono para acionar a geração de PDF em background (non-blocking)
 */
export function triggerGeracaoDossie(dossieId: string): void {
  console.log(`[DossieService] Disparando geração do dossiê em background para ID: ${dossieId}`);
  processarGeracaoDossie(dossieId)
    .then(() => {
      console.log(`[DossieService] Processamento em background finalizado para ID: ${dossieId}`);
    })
    .catch((err) => {
      console.error(`[DossieService] Falha crítica em background para ID ${dossieId}:`, err);
    });
}
