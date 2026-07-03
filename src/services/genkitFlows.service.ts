import { AppDataSource } from '../config/database';
import { Checklist, ChecklistStatus } from '../entities/Checklist';
import { OrdemTeste } from '../entities/OrdemTeste';
import { ConfigOpcao } from '../entities/ConfigOpcao';
import { Usuario } from '../entities/Usuario';
import { Email, TipoEmail, EmailStatus } from '../entities/Email';
import nodemailer from 'nodemailer';

// Configuração do transporter Nodemailer
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
 * Monta o HTML corporativo formatado para o e-mail de checklist utilizando Template Literals
 */
function generateChecklistHtml(
  testOrder: OrdemTeste | null,
  checklist: Checklist,
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
  const itemsRowsHtml = checklistData.itens.map((it) => `
    <tr style="border-bottom: 1px solid #ddd;">
      <td style="padding: 10px; text-align: left; font-size: 14px;">${labelSetor}</td>
      <td style="padding: 10px; text-align: left; font-size: 14px;">${it.descricao}</td>
      <td style="padding: 10px; text-align: center; font-size: 14px;">${it.conforme ? '✅ Sim' : '❌ Não'}</td>
      <td style="padding: 10px; text-align: left; font-size: 14px;">${it.resposta || '-'}</td>
      <td style="padding: 10px; text-align: left; font-size: 14px;">${it.observacao || '-'}</td>
    </tr>
  `).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8">
        <title>Resumo do Checklist - Setor ${labelSetor}</title>
      </head>
      <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; margin: 0; padding: 20px; background-color: #f9f9f9;">
        <div style="max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #e0e0e0;">
          <h2 style="color: #0b3c5d; border-bottom: 2px solid #0b3c5d; padding-bottom: 10px; margin-top: 0;">
            Relatório de Checklist - Chão de Fábrica
          </h2>
          
          <div style="margin-bottom: 20px; background-color: #f2f4f7; padding: 15px; border-radius: 6px;">
            <p style="margin: 5px 0; font-size: 14px;"><strong>Ordem de Teste:</strong> ${testOrder?.codigoBarras || 'N/A'}</p>
            <p style="margin: 5px 0; font-size: 14px;"><strong>Modelo:</strong> ${testOrder?.modelo?.nome || 'N/A'} (${testOrder?.modelo?.codigoProduto || 'N/A'})</p>
            <p style="margin: 5px 0; font-size: 14px;"><strong>Setor:</strong> ${labelSetor}</p>
            <p style="margin: 5px 0; font-size: 14px;"><strong>Preenchido Por:</strong> ${checklistData.preenchidoPor}</p>
            <p style="margin: 5px 0; font-size: 14px;"><strong>Data:</strong> ${checklistData.dataPreenchimento ? new Date(checklistData.dataPreenchimento).toLocaleString('pt-BR') : 'N/A'}</p>
            <p style="margin: 5px 0; font-size: 14px;"><strong>Status Geral:</strong> <span style="font-weight: bold; color: ${checklistData.status === 'COM_PENDENCIAS' ? '#d9534f' : '#5cb85c'};">${checklistData.status}</span></p>
          </div>

          <h3 style="color: #328cc1; margin-top: 25px; font-size: 16px;">Itens do Checklist</h3>
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <thead>
              <tr style="background-color: #0b3c5d; color: #fff;">
                <th style="padding: 10px; text-align: left; font-size: 13px;">Setor</th>
                <th style="padding: 10px; text-align: left; font-size: 13px;">Item / Requisito</th>
                <th style="padding: 10px; text-align: center; font-size: 13px;">Conforme</th>
                <th style="padding: 10px; text-align: left; font-size: 13px;">Resposta</th>
                <th style="padding: 10px; text-align: left; font-size: 13px;">Observação</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRowsHtml}
            </tbody>
          </table>

          ${checklist.observacoes ? `
            <div style="margin-top: 20px; padding: 10px; border-left: 4px solid #328cc1; background-color: #f9f9f9; font-size: 14px;">
              <p style="margin: 0;"><strong>Observações Gerais:</strong></p>
              <p style="margin: 5px 0 0 0; font-style: italic;">${checklist.observacoes}</p>
            </div>
          ` : ''}

          <div style="margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 15px; font-size: 12px; color: #777; text-align: center;">
            Este é um e-mail automático gerado pelo ERP Dass de Modelagem de Calçados.
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Envia o e-mail do checklist de forma assíncrona.
 * Busca dados no PostgreSQL via TypeORM e envia utilizando Nodemailer SMTP.
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
      return { success: false, message: `Checklist com id ${checklistId} não encontrado.` };
    }

    // 2. Busca informações do setor
    const currentSectorOpt = await configOpcaoRepo.findOne({
      where: { id: checklist.setor.tipoOpcaoId },
    });
    const labelSetor = currentSectorOpt?.label || checklist.setor.nome;

    // 3. Busca a Ordem de Teste e o Modelo
    const testOrder = await AppDataSource.getRepository(OrdemTeste).findOne({
      where: { id: ordemTesteId },
      relations: { modelo: true },
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

    // 5. Gera HTML nativo por Template Literals
    const corpoHtml = generateChecklistHtml(testOrder, checklist, labelSetor, checklistData);

    // 6. Define o Assunto do e-mail
    const assunto = `[Checklist ${checklist.status}] Setor ${labelSetor} - Ordem de Teste ${testOrder?.codigoBarras || ''}`;

    // 7. Lista de destinatários
    const recipientUsers = await userRepo.find({
      relations: { perfil: true },
      where: [
        { perfil: { nome: 'MODELISTA' }, ativo: true },
        { perfil: { nome: 'GERENTE_MODELAGEM' }, ativo: true }
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
        from: '"ERP Chão de Fábrica" <noreply@dass.com.br>',
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
    console.error('[dispararEmailChecklist] Erro crítico no fluxo:', error);
    return {
      success: false,
      message: `Erro crítico no fluxo: ${error.message || error}`,
    };
  }
}

/**
 * Função utilitária para acionar o flow de e-mail de forma assíncrona.
 * Isso impede que a resposta HTTP do controlador fique aguardando o envio do SMTP.
 */
export function triggerChecklistEmail(checklistId: string, ordemTesteId: string): void {
  console.log(`[EmailFlow] Acionando envio de e-mail nativo para checklistId=${checklistId}, ordemTesteId=${ordemTesteId}`);
  dispararEmailChecklist(checklistId, ordemTesteId)
    .then((res) => {
      if (res.success) {
        console.log(`[EmailFlow] Envio concluído com sucesso. Email ID: ${res.emailId}`);
      } else {
        console.warn(`[EmailFlow] Envio concluído com aviso: ${res.message}`);
      }
    })
    .catch((err) => {
      console.error('[EmailFlow] Erro crítico ao executar o envio de e-mail:', err);
    });
}
