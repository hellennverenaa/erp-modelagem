import puppeteer from 'puppeteer';
import bwipjs from 'bwip-js';
import { OrdemTeste } from '../entities/OrdemTeste';

export class EtiquetaService {
  /**
   * Gera o buffer do codigo de barras em base64 (Code 128) usando a biblioteca bwip-js.
   */
  private static gerarCodigoBarrasBase64(texto: string): Promise<string> {
    return new Promise((resolve, reject) => {
      bwipjs.toBuffer({
        bcid: 'code128',
        text: texto,
        scale: 3,
        height: 10,
        includetext: false, // O numero sera renderizado manualmente abaixo com JetBrains Mono
      }, (err, png) => {
        if (err) {
          reject(err);
        } else {
          resolve(`data:image/png;base64,${png.toString('base64')}`);
        }
      });
    });
  }

  /**
   * Gera o PDF das etiquetas de rastreamento formatado para gabarito A4 de 10 etiquetas (2 colunas x 5 linhas).
   */
  public async gerarEtiquetasPdf(ordens: OrdemTeste[]): Promise<Buffer> {
    let browser;
    try {
      // 1. Gerar imagens base64 dos codigos de barras para cada ordem
      const etiquetasData = await Promise.all(
        ordens.map(async (ordem) => {
          const barcodeBase64 = await EtiquetaService.gerarCodigoBarrasBase64(ordem.codigoBarras);
          return {
            ordem,
            barcodeBase64,
          };
        })
      );

      // 2. Dividir em chunks de exatos 10 itens para paginacao
      const itemsPerPage = 10;
      const paginas: any[][] = [];
      for (let i = 0; i < etiquetasData.length; i += itemsPerPage) {
        paginas.push(etiquetasData.slice(i, i + itemsPerPage));
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>Etiquetas de Rastreamento</title>
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&family=JetBrains+Mono:wght@400;700&display=swap">
          <style>
            @page {
              size: A4;
              margin: 10mm;
            }
            body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #0f172a;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page-a4 {
              display: grid;
              grid-template-columns: repeat(2, 90mm);
              grid-template-rows: repeat(5, 46mm);
              justify-content: center;
              gap: 2mm;
              height: 277mm;
              width: 100%;
              box-sizing: border-box;
              page-break-after: always;
            }
            .page-a4:last-child {
              page-break-after: avoid;
            }
            .etiqueta {
              width: 90mm;
              height: 46mm;
              border: 1px dashed #ccc;
              padding: 4mm;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              overflow: hidden;
              page-break-inside: avoid;
              background-color: #ffffff;
            }
            .etiqueta-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              width: 100%;
            }
            .modelo-nome {
              font-family: 'Inter', sans-serif;
              font-size: 11px;
              font-weight: 800;
              color: #000000;
              text-transform: uppercase;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              max-width: 52mm;
            }
            .badge-teste {
              background-color: #000000;
              color: #ffffff;
              padding: 2px 6px;
              font-family: 'Inter', sans-serif;
              font-weight: 700;
              font-size: 8px;
              text-transform: uppercase;
              border-radius: 2px;
              letter-spacing: 0.5px;
              white-space: nowrap;
            }
            .barcode-container {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              flex-grow: 1;
              margin: 1.5mm 0;
            }
            .barcode-img {
              width: 100%;
              height: 22mm;
              object-fit: contain;
            }
            .barcode-number {
              font-family: 'JetBrains Mono', monospace;
              font-size: 9px;
              font-weight: 700;
              text-align: center;
              letter-spacing: 2px;
              margin-top: 1px;
              color: #000000;
            }
            .etiqueta-footer {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-family: 'Inter', sans-serif;
              font-size: 8px;
              color: #64748b;
              border-top: 1px solid #f1f5f9;
              padding-top: 1mm;
            }
            .ref-mono {
              font-family: 'JetBrains Mono', monospace;
              font-weight: 700;
              color: #475569;
            }
          </style>
        </head>
        <body>
          ${paginas.map((items) => `
            <div class="page-a4">
              ${items.map(({ ordem, barcodeBase64 }) => `
                <div class="etiqueta">
                  <div class="etiqueta-header">
                    <span class="modelo-nome">${ordem.modelo?.nome || 'Modelo N/A'}</span>
                    <span class="badge-teste">${ordem.possuiCaixaTeste ? 'TESTE DE PRODUCAO' : 'LOTE PRINCIPAL'}</span>
                  </div>
                  <div class="barcode-container">
                    <img class="barcode-img" src="${barcodeBase64}" alt="Codigo de barras" />
                    <div class="barcode-number">${ordem.codigoBarras}</div>
                  </div>
                  <div class="etiqueta-footer">
                    <span>${ordem.planta?.nome || 'Planta DASS'}</span>
                    <span class="ref-mono">REF: ${ordem.modelo?.codigoProduto || 'N/A'}</span>
                    <span>${new Date().toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          `).join('')}
        </body>
        </html>
      `;

      // 3. Iniciar Puppeteer para gerar o PDF
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0mm',
          bottom: '0mm',
          left: '0mm',
          right: '0mm',
        },
      });

      await browser.close();
      return Buffer.from(pdfBuffer);
    } catch (error) {
      if (browser) {
        await browser.close();
      }
      console.error('[EtiquetaService] Erro ao gerar etiquetas em PDF:', error);
      throw error;
    }
  }
}
