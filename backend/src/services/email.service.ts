import { AppDataSource } from '../config/database';
import { Checklist, ChecklistStatus } from '../entities/Checklist';
import { OrdemTeste } from '../entities/OrdemTeste';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { Usuario } from '../entities/Usuario';
import { Email, TipoEmail, EmailStatus } from '../entities/Email';
import nodemailer from 'nodemailer';

// Configuracao do transporter Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '1025', 10),
  auth: {
    user: process.env.SMTP_USER || 'test@example.com',
    pass: process.env.SMTP_PASS || 'password',
  },
  tls: {
    rejectUnauthorized: false,
  },
});

/**
 * Monta o HTML corporativo formatado para o e-mail de checklist utilizando Template Literals puros (Sem Emojis)
 */
function generateChecklistHtml(
  testOrder: OrdemTeste | null,
  _checklist: Checklist,
  labelSetor: string,
  checklistData: {
    setor: string;
    preenchidoPor: string;
    dataPreenchimento: Date;
    status: ChecklistStatus;
    bloqueante: boolean;
    observacoes: string | null;
    itens: {
      descricao: string;
      conforme: boolean;
      resposta: string | null;
      observacao: string | null;
      isAvulso: boolean;
    }[];
  }
): string {
  const modeloNome = testOrder?.modelo?.nome || 'MODELO NÃO IDENTIFICADO';
  const marcaNome = testOrder?.modelo?.marca?.nome || 'NIKE / DASS';
  const codigoProduto = testOrder?.modelo?.codigoProduto || 'N/A';
  const categoriaTemporada = testOrder?.modelo?.temporada || 'NSW CASUAL';
  const codigoBarras = testOrder?.codigoBarras || 'N/A';
  const dataRevisao = checklistData.dataPreenchimento 
    ? new Date(checklistData.dataPreenchimento).toLocaleString('pt-BR') 
    : new Date().toLocaleString('pt-BR');
  
  const hasPending = checklistData.status === ChecklistStatus.COM_PENDENCIAS || checklistData.itens.some(i => !i.conforme);

  const pendingItemsList = checklistData.itens
    .filter(i => !i.conforme)
    .map(i => `<li style="margin-bottom: 4px;"><strong>${i.descricao}</strong>: ${i.observacao || i.resposta || 'Não Conforme'}</li>`)
    .join('');

  const itemsRowsHtml = checklistData.itens.map((it, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 10px 12px; font-weight: 600; font-size: 13px; color: #1e293b;">${it.descricao}</td>
      <td style="padding: 10px 12px; text-align: center; font-weight: bold; font-size: 12px;">
        <span style="display: inline-block; padding: 4px 10px; border-radius: 4px; color: #ffffff; background-color: ${it.conforme ? '#16a34a' : '#dc2626'};">
          ${it.conforme ? 'OK (CONFORME)' : 'NÃO OK'}
        </span>
      </td>
      <td style="padding: 10px 12px; font-size: 12px; color: #475569;">
        ${it.observacao ? `<strong>Obs:</strong> ${it.observacao}` : (it.resposta || '-')}
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>REVISÃO DO PACOTE TÉCNICO DE QUALIDADE - ${modeloNome}</title>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1e293b; line-height: 1.5; margin: 0; padding: 24px; background-color: #f1f5f9;">
  <div style="max-width: 680px; margin: 0 auto; background-color: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    
    <!-- BLOCO 1: CABEÇALHO DE IDENTIFICAÇÃO -->
    <div style="margin-bottom: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px;">
      <h2 style="margin: 0 0 14px 0; font-size: 15px; font-weight: bold; color: #0f172a; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; padding-bottom: 8px;">
        1. PACOTE TÉCNICO & IDENTIFICAÇÃO DO MODELO
      </h2>
      <table style="width: 100%; font-size: 13px; color: #334155; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 10px; font-weight: bold; width: 35%; color: #475569;">MODELO:</td>
          <td style="padding: 6px 10px; font-weight: bold; color: #0f172a;">${modeloNome}</td>
        </tr>
        <tr style="background-color: #ffffff;">
          <td style="padding: 6px 10px; font-weight: bold; color: #475569;">MARCA / CÓD PRODUTO:</td>
          <td style="padding: 6px 10px;">${marcaNome} — ${codigoProduto}</td>
        </tr>
        <tr>
          <td style="padding: 6px 10px; font-weight: bold; color: #475569;">CATEGORIA / TEMPORADA:</td>
          <td style="padding: 6px 10px;">${categoriaTemporada}</td>
        </tr>
        <tr style="background-color: #ffffff;">
          <td style="padding: 6px 10px; font-weight: bold; color: #475569;">CÓDIGO OP / BARRAS:</td>
          <td style="padding: 6px 10px; font-weight: bold; color: #2563eb;">${codigoBarras}</td>
        </tr>
        <tr>
          <td style="padding: 6px 10px; font-weight: bold; color: #475569;">ETAPA / SETOR:</td>
          <td style="padding: 6px 10px; font-weight: bold; color: #0f172a;">${labelSetor}</td>
        </tr>
        <tr style="background-color: #ffffff;">
          <td style="padding: 6px 10px; font-weight: bold; color: #475569;">MODELISTA / RESPONSÁVEL:</td>
          <td style="padding: 6px 10px;">${checklistData.preenchidoPor}</td>
        </tr>
        <tr>
          <td style="padding: 6px 10px; font-weight: bold; color: #475569;">DATA DE REVISÃO:</td>
          <td style="padding: 6px 10px;">${dataRevisao}</td>
        </tr>
      </table>
    </div>

    <!-- BLOCO 2: PACOTE TÉCNICO DE CORTE / REVISÃO DE ITENS -->
    <div style="margin-bottom: 24px;">
      <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: bold; color: #0f172a; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; padding-bottom: 6px;">
        2. PACOTE TÉCNICO & PEÇAS DE REVISÃO (${labelSetor})
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">
        <thead>
          <tr style="background-color: #0f172a; color: #ffffff; text-align: left;">
            <th style="padding: 10px 12px; border: 1px solid #1e293b;">ITEM / REQUISITO TÉCNICO</th>
            <th style="padding: 10px 12px; border: 1px solid #1e293b; text-align: center; width: 130px;">CONFORMIDADE</th>
            <th style="padding: 10px 12px; border: 1px solid #1e293b;">OBSERVAÇÃO / RESPOSTA</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml || '<tr><td colspan="3" style="padding: 12px; text-align: center; color: #64748b;">Nenhum item individual marcado.</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- BLOCO 3: MATERIAIS SEPARADOS EM SEST PARA TESTES -->
    <div style="margin-bottom: 24px; background-color: #f1f5f9; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 0 8px 8px 0;">
      <h3 style="margin: 0 0 10px 0; font-size: 13px; font-weight: bold; color: #1e3a8a; text-transform: uppercase;">
        3. MATERIAIS SEPARADOS EM SEST PARA TESTAR DUBLAGEM & COMPLETAR TESTE
      </h3>
      <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #334155; line-height: 1.8;">
        <li>Cartela de Dublagem, Pé Aberto (MST), Ficha Técnica e Ficha de Peça conferidas.</li>
        <li>Materiais recebidos e separados no setor para teste de fusão / dublagem conforme especificação do modelo.</li>
        <li>Gabaritos conferidores e ferramentas de preparação verificadas para liberação da ordem.</li>
      </ul>
    </div>

    <!-- BLOCO 4: PENDÊNCIAS / OBSERVAÇÕES IMPORTANTES -->
    <div style="margin-bottom: 24px; background-color: ${hasPending ? '#fff1f2' : '#f0fdf4'}; border-left: 4px solid ${hasPending ? '#e11d48' : '#16a34a'}; padding: 16px; border-radius: 0 8px 8px 0;">
      <h3 style="margin: 0 0 10px 0; font-size: 13px; font-weight: bold; color: ${hasPending ? '#9f1239' : '#14532d'}; text-transform: uppercase;">
        4. PENDÊNCIAS / OBSERVAÇÕES IMPORTANTES
      </h3>
      <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: bold; color: ${hasPending ? '#be123c' : '#15803d'};">
        STATUS DO CHECKLIST: ${hasPending ? 'COM PENDÊNCIAS (ATENÇÃO/BLOQUEANTE)' : 'PREENCHIDO COM SUCESSO (LIBERADO)'}
      </p>
      ${checklistData.observacoes ? `<p style="margin: 6px 0 0 0; font-size: 12px; color: #475569;"><strong>Observações Gerais do Operador:</strong> ${checklistData.observacoes}</p>` : ''}
      ${pendingItemsList ? `
        <div style="margin-top: 10px; font-size: 12px; color: #9f1239;">
          <strong>Itens Registrados com Não Conformidade:</strong>
          <ul style="margin: 4px 0 0 0; padding-left: 18px;">
            ${pendingItemsList}
          </ul>
        </div>
      ` : ''}
    </div>

    <!-- BLOCO 5: ASSINATURA CORPORATIVA E RODAPÉ -->
    <div style="margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 18px; font-size: 12px; color: #64748b;">
      <p style="margin: 0 0 4px 0; font-weight: bold; color: #0f172a; font-size: 13px;">Almoxarifado da Modelagem — Grupo Dass</p>
      <p style="margin: 0 0 4px 0; color: #475569;">Pacote Técnico de Qualidade — Unidade Santo Estêvão</p>
      <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 11px; font-style: italic;">Este é um e-mail corporativo gerado automaticamente pelo ERP Dass de Modelagem de Calçados. Não responda diretamente a esta mensagem.</p>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Envia o e-mail do checklist de forma assincrona usando exclusivamente Nodemailer SMTP.
 */
export async function dispararEmailChecklist(
  checklistId: string,
  ordemTesteId: string
): Promise<{ success: boolean; emailId?: string; message: string }> {
  try {
    const checklistRepo = AppDataSource.getRepository(Checklist);
    const configOpcaoRepo = AppDataSource.getRepository(ConfigOpcao);
    const userRepo = AppDataSource.getRepository(Usuario);
    const emailLogRepo = AppDataSource.getRepository(Email);

    // 1. Busca o checklist atual
    const checklist = await checklistRepo.findOne({
      where: { id: checklistId },
      relations: {
        itens: { templateItem: true },
        template: true,
        setor: true,
        preenchidoPor: true,
      },
    });

    if (!checklist) {
      return { success: false, message: `Checklist com id ${checklistId} nao encontrado.` };
    }

    // 2. Busca informacoes do setor
    const currentSectorOpt = await configOpcaoRepo.findOne({
      where: { id: checklist.setor.tipoOpcaoId },
    });
    const labelSetor = currentSectorOpt?.label || checklist.setor.nome;

    // 3. Busca a Ordem de Teste, o Modelo e a Marca
    const testOrder = await AppDataSource.getRepository(OrdemTeste).findOne({
      where: { id: ordemTesteId },
      relations: { modelo: { marca: true } },
    });

    // 4. Formata dados dos itens
    const checklistData = {
      setor: labelSetor,
      preenchidoPor: checklist.preenchidoPor?.nomeCompleto || 'Desconhecido',
      dataPreenchimento: checklist.dataPreenchimento,
      status: checklist.status,
      bloqueante: checklist.bloqueante,
      observacoes: checklist.observacoes,
      itens: checklist.itens.map((it) => ({
        descricao: it.templateItem?.descricao || it.descricaoAvulsa || 'Item Avulso',
        conforme: it.conforme,
        resposta: it.valorResposta,
        observacao: it.observacao,
        isAvulso: !it.templateItemId,
      })),
    };

    // 5. Gera HTML nativo por Template Literals puros
    const corpoHtml = generateChecklistHtml(testOrder, checklist, labelSetor, checklistData);

    // 6. Define o Assunto do e-mail
    const assunto = `[Checklist ${checklist.status}] Setor ${labelSetor} - Ordem de Teste ${testOrder?.codigoBarras || ''}`;

    // 7. Lista de destinatarios
    const recipientUsers = await userRepo.find({
      relations: { perfil: true },
      where: [
        { perfil: { nome: 'MODELISTA' }, ativo: true },
        { perfil: { nome: 'GERENTE' }, ativo: true }
      ]
    });

    const emailsList = recipientUsers
      .map(u => u.email)
      .filter((email): email is string => !!email);

    if (checklist.preenchidoPor?.email) {
      emailsList.push(checklist.preenchidoPor.email);
    }

    const uniqueEmails = Array.from(new Set(emailsList));
    if (uniqueEmails.length === 0) {
      uniqueEmails.push('lista.distribuicao@dass.com.br');
    }

    // 8. Determina o tipo do email
    const hasPendencies = checklist.status === ChecklistStatus.COM_PENDENCIAS;
    const tipoEmail = hasPendencies ? TipoEmail.CHECKLIST_PENDENCIAS : TipoEmail.CHECKLIST_CONCESSAO;

    // 9. Registra o e-mail na tabela
    const emailLog = emailLogRepo.create({
      ordemTesteId,
      checklistId: checklist.id,
      tipoEmail,
      assunto,
      corpoHtml,
      destinatarios: uniqueEmails,
      status: EmailStatus.PENDENTE,
    });

    const savedEmail = await emailLogRepo.save(emailLog);

    // 10. Envia o e-mail via SMTP
    try {
      await transporter.sendMail({
        from: '"ERP Chao de Fabrica" <noreply@grupodass.com.br>',
        to: uniqueEmails.join(','),
        subject: assunto,
        html: corpoHtml,
      });

      savedEmail.status = EmailStatus.ENVIADO;
      savedEmail.dataEnvio = new Date();
      await emailLogRepo.save(savedEmail);

      return {
        success: true,
        emailId: savedEmail.id,
        message: 'E-mail disparado e registrado com sucesso.',
      };
    } catch (err: any) {
      console.error('[dispararEmailChecklist] Falha no SMTP:', err);
      savedEmail.status = EmailStatus.ERRO;
      savedEmail.erroMensagem = err.message || String(err);
      await emailLogRepo.save(savedEmail);

      return {
        success: false,
        emailId: savedEmail.id,
        message: `Falha ao enviar e-mail por SMTP: ${err.message || err}`,
      };
    }
  } catch (error: any) {
    console.error('[dispararEmailChecklist] Erro critico no fluxo:', error);
    return {
      success: false,
      message: `Erro critico no fluxo: ${error.message || error}`,
    };
  }
}

/**
 * Funcao utilitaria para acionar o fluxo de e-mail de forma assincrona (100% offline).
 */
export function triggerChecklistEmail(checklistId: string, ordemTesteId: string): void {
  console.log(`[EmailFlow] Acionando envio de e-mail nativo para checklistId=${checklistId}, ordemTesteId=${ordemTesteId}`);
  dispararEmailChecklist(checklistId, ordemTesteId)
    .then((res) => {
      if (res.success) {
        console.log(`[EmailFlow] Envio concluido com sucesso. Email ID: ${res.emailId}`);
      } else {
        console.warn(`[EmailFlow] Envio concluido com aviso: ${res.message}`);
      }
    })
    .catch((err) => {
      console.error('[EmailFlow] Erro critico ao executar o envio de e-mail:', err);
    });
}
