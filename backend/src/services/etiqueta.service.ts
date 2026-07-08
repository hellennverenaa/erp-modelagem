import puppeteer from 'puppeteer';
import bwipjs from 'bwip-js';
import { OrdemTeste } from '../entities/OrdemTeste';

export class EtiquetaService {
  /**
   * Gera o buffer do código de barras em base64 (Code 128) usando a biblioteca bwip-js.
   */
  private static gerarCodigoBarrasBase64(texto: string): Promise<string> {
    return new Promise((resolve, reject) => {
      bwipjs.toBuffer({
        bcid: 'code128',
        text: texto,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: 'center',
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
      // 1. Gerar imagens base64 dos códigos de barras para cada ordem
      const etiquetasData = await Promise.all(
        ordens.map(async (ordem) => {
          const barcodeBase64 = await EtiquetaService.gerarCodigoBarrasBase64(ordem.codigoBarras);
          return {
            ordem,
            barcodeBase64,
          };
        })
      );

      // 2. Montar o HTML agrupando em páginas de no máximo 10 etiquetas
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
          <style>
            @page {
              size: A4;
              margin: 10mm;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              background: #ffffff;
              color: #0f172a;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page {
              width: 190mm;
              height: 277mm;
              page-break-after: always;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              align-items: center;
            }
            .page:last-child {
              page-break-after: avoid;
            }
            .grid-container {
              display: grid;
              grid-template-columns: repeat(2, 90mm);
              grid-template-rows: repeat(5, 46mm);
              gap: 5mm 10mm;
              justify-content: center;
              align-content: start;
              box-sizing: border-box;
              width: 100%;
              height: 100%;
            }
            .etiqueta {
              width: 90mm;
              height: 46mm;
              border: 1px dashed #cbd5e1;
              box-sizing: border-box;
              padding: 3mm 4mm;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              background-color: #ffffff;
            }
            .etiqueta-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 1.5px solid #e2e8f0;
              padding-bottom: 1mm;
              margin-bottom: 1mm;
            }
            .modelo-nome {
              font-size: 7.5pt;
              font-weight: 800;
              color: #0f172a;
              text-transform: uppercase;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              max-width: 60mm;
            }
            .lote-tipo {
              font-size: 6.5pt;
              font-weight: 700;
              color: #475569;
              background: #f1f5f9;
              padding: 0.2mm 1.5mm;
              border-radius: 1mm;
              border: 0.5px solid #e2e8f0;
            }
            .etiqueta-body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              flex-grow: 1;
              margin: 1mm 0;
            }
            .barcode-img {
              max-width: 80mm;
              max-height: 18mm;
              object-fit: contain;
            }
            .etiqueta-footer {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 6pt;
              color: #64748b;
              border-top: 1px solid #f1f5f9;
              padding-top: 1mm;
              margin-top: 1mm;
            }
            .planta-nome {
              font-weight: 700;
              text-transform: uppercase;
            }
          </style>
        </head>
        <body>
          ${paginas.map((items) => `
            <div class="page">
              <div class="grid-container">
                ${items.map(({ ordem, barcodeBase64 }) => `
                  <div class="etiqueta">
                    <div class="etiqueta-header">
                      <span class="modelo-nome">${ordem.modelo?.nome || 'Modelo N/A'}</span>
                      <span class="lote-tipo">${ordem.possuiCaixaTeste ? 'Caixa Teste' : 'Lote Principal'}</span>
                    </div>
                    <div class="etiqueta-body">
                      <img class="barcode-img" src="${barcodeBase64}" alt="Código de barras" />
                    </div>
                    <div class="etiqueta-footer">
                      <span class="planta-nome">${ordem.planta?.nome || 'Planta DASS'}</span>
                      <span>Ref: ${ordem.modelo?.codigoProduto || 'N/A'}</span>
                      <span>Gerado: ${new Date().toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
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
