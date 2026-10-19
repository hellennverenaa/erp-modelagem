import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import puppeteer from 'puppeteer';
import { PuppeteerService } from '../puppeteer.service';

vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn(),
  },
}));

describe('PuppeteerService - Singleton, Isolamento de Abas e Ciclo de Vida', () => {
  let mockBrowser: any;
  let mockPage: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (PuppeteerService as any).browser = null;
    (PuppeteerService as any).initPromise = null;

    mockPage = {
      setContent: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 test content')),
      close: vi.fn().mockResolvedValue(undefined),
    };

    mockBrowser = {
      connected: true,
      on: vi.fn(),
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined),
    };

    (puppeteer.launch as any).mockResolvedValue(mockBrowser);
  });

  afterEach(async () => {
    await PuppeteerService.close();
  });

  it('deve reutilizar a mesma instância do Chromium (Padrão Singleton) sem múltiplos spawns', async () => {
    const browser1 = await PuppeteerService.getBrowser();
    const browser2 = await PuppeteerService.getBrowser();

    expect(browser1).toBe(browser2);
    expect(puppeteer.launch).toHaveBeenCalledTimes(1);
    expect(puppeteer.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: true,
        args: expect.arrayContaining(['--no-sandbox', '--disable-setuid-sandbox']),
      })
    );
  });

  it('deve reinicializar o processo caso o browser seja desconectado (Auto-Recuperação)', async () => {
    await PuppeteerService.getBrowser();
    expect(puppeteer.launch).toHaveBeenCalledTimes(1);

    // Simula evento de desconexão do processo Chromium
    const disconnectCallback = mockBrowser.on.mock.calls.find((call: any[]) => call[0] === 'disconnected')?.[1];
    expect(disconnectCallback).toBeDefined();
    disconnectCallback();

    // Próxima chamada deve disparar um novo launch
    await PuppeteerService.getBrowser();
    expect(puppeteer.launch).toHaveBeenCalledTimes(2);
  });

  it('deve renderizar PDF e garantir o fechamento da aba no bloco finally', async () => {
    const html = '<html><body><h1>Etiqueta de Teste</h1></body></html>';
    const pdfBuffer = await PuppeteerService.renderPdf(
      html,
      { format: 'A4', printBackground: true },
      'domcontentloaded'
    );

    expect(mockBrowser.newPage).toHaveBeenCalledTimes(1);
    expect(mockPage.setContent).toHaveBeenCalledWith(html, { waitUntil: 'domcontentloaded' });
    expect(mockPage.pdf).toHaveBeenCalledWith({ format: 'A4', printBackground: true });
    expect(mockPage.close).toHaveBeenCalledTimes(1); // Garantia de que a aba é liberada
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.toString()).toContain('%PDF');
  });

  it('deve garantir fechamento da aba mesmo se houver erro durante a renderização do PDF', async () => {
    mockPage.pdf.mockRejectedValueOnce(new Error('Erro na geração do PDF'));

    await expect(
      PuppeteerService.renderPdf('<html><body>Falha</body></html>')
    ).rejects.toThrow('Erro na geração do PDF');

    expect(mockPage.close).toHaveBeenCalledTimes(1);
  });
});
