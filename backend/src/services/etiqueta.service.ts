// backend/src/services/etiqueta.service.ts
import puppeteer from 'puppeteer';
import bwipjs from 'bwip-js';

export interface EtiquetaDTO {
  codigoPeca: string;      
  tamanho: string;         
  quantidade: number;
  modelo: string;          
  versao: string;          
  produtoDescricao: string;
  ordemTeste: string;
  pacote: string;
  documento: string;
  semana: string;
  material: string;
  itens: string;
  talao: string;
  codigoBarras: string;    
  possuiCaixaTeste?: boolean;
  plantaNome?: string;
  tipoLote?: 'CAIXA_TESTE' | 'LOTE_PRINCIPAL';
}

export class EtiquetaService {
  private static async gerarBarcodeBase64(texto: string): Promise<string> {
    const png = await bwipjs.toBuffer({
      bcid: 'code128', 
      text: texto,
      scale: 3,
      height: 10,
      includetext: false, // O numero sera renderizado manualmente abaixo com JetBrains Mono
    });
    return `data:image/png;base64,${png.toString('base64')}`;
  }

  private static async compilarHtml(etiquetas: EtiquetaDTO[]): Promise<string> {
    // 1. Multiplicação do Lote: Cria exatamente 10 cópias idênticas para cada etiqueta
    const etiquetasMultiplicadas: EtiquetaDTO[] = [];
    for (const etq of etiquetas) {
      for (let k = 0; k < 10; k++) {
        etiquetasMultiplicadas.push({ ...etq });
      }
    }

    // 2. Dividir em chunks de exatos 10 itens para paginação
    const itemsPerPage = 10;
    const paginas: EtiquetaDTO[][] = [];
    for (let i = 0; i < etiquetasMultiplicadas.length; i += itemsPerPage) {
      paginas.push(etiquetasMultiplicadas.slice(i, i + itemsPerPage));
    }

    // 3. Gerar HTML com imagens em base64 e CSS premium
    const paginasHtml: string[] = [];
    for (const pagina of paginas) {
      let pageContent = '';
      for (const etq of pagina) {
        const sufixo = etq.tipoLote === 'CAIXA_TESTE' ? '-CX' : '-LP';
        let codigoBarras = etq.codigoBarras;
        if (!codigoBarras.endsWith('-CX') && !codigoBarras.endsWith('-LP')) {
          codigoBarras += sufixo;
        }

        const barcodeData = await this.gerarBarcodeBase64(codigoBarras);
        const badgeText = etq.tipoLote === 'CAIXA_TESTE' ? 'CAIXA TESTE' : 'LOTE PRINCIPAL';
        
        pageContent += `
          <div class="etiqueta">
            <div class="etiqueta-header">
              <span class="modelo-nome">${etq.modelo}</span>
              <span class="badge-teste">${badgeText}</span>
            </div>
            <div class="alerta-producao">TESTE DE PRODUÇÃO</div>
            <div class="barcode-container">
              <img class="barcode-img" src="${barcodeData}" alt="Codigo de barras" />
              <div class="barcode-number">${codigoBarras}</div>
            </div>
            <div class="etiqueta-footer">
              <span>${etq.plantaNome || 'PLANTA DASS'}</span>
              <span class="ref-mono">REF: ${etq.produtoDescricao}</span>
              <span>${new Date().toLocaleDateString('pt-BR')}</span>
            </div>
          </div>
        `;
      }
      
      paginasHtml.push(`
        <div class="page-a4">
          ${pageContent}
        </div>
      `);
    }

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Etiquetas de Rastreamento</title>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&family=JetBrains+Mono:wght@400;700&display=swap">
        <style>
          @page {
            size: A4;
            margin: 0;
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
            grid-template-rows: repeat(5, 53mm);
            gap: 0;
            column-gap: 0;
            row-gap: 0;
            width: 210mm;
            height: 297mm;
            padding: 13mm;
            box-sizing: border-box;
            page-break-after: always;
            justify-content: center;
            align-content: start;
          }
          .page-a4:last-child {
            page-break-after: avoid;
          }
          .etiqueta {
            width: 90mm;
            height: 53mm;
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
          .alerta-producao {
            font-family: 'Inter', sans-serif;
            font-weight: 800;
            font-size: 10px;
            color: #000000;
            text-align: center;
            text-transform: uppercase;
            border: 1px solid #000000;
            padding: 1px 0;
            margin-top: 1mm;
            letter-spacing: 1px;
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
        ${paginasHtml.join('')}
      </body>
      </html>
    `;
  }

  public static async gerarPdfEtiquetas(etiquetas: EtiquetaDTO[]): Promise<Buffer> {
    const html = await this.compilarHtml(etiquetas);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true, // Forçar o tamanho e escala do CSS da página
      scale: 1, // Travar a escala em 1.0 para evitar "Shrink to Fit"
      margin: {
        top: '0mm',
        bottom: '0mm',
        left: '0mm',
        right: '0mm',
      }
    });
    await browser.close();
    return Buffer.from(pdfBuffer);
  }
}