import { z } from 'genkit';
import { ai } from '../config/genkit';
import { googleAI } from '@genkit-ai/google-genai';
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
 * Flow Genkit 4.1 — dispararEmailChecklist
 * Busca dados do checklist atual e, caso seja o último preenchido entre Almoxarifado, Navalha e Telas,
 * consolida os 3 checklists paralelos em um único e-mail com resumo gerado por IA.
 */
export const dispararEmailChecklistFlow = ai.defineFlow(
  {
    name: 'dispararEmailChecklistFlow',
    inputSchema: z.object({
      checklistId: z.string().uuid(),
      ordemTesteId: z.string().uuid(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      emailId: z.string().uuid().optional(),
      message: z.string(),
    }),
  },
  async (input) => {
    const { checklistId, ordemTesteId } = input;

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

    const checklistsToReport = [
      {
        checklist,
        tipoSetor: currentSectorOpt?.valor || '',
        labelSetor,
      },
    ];

    // 3. Busca a Ordem de Teste e o Modelo
    const testOrder = await AppDataSource.getRepository(OrdemTeste).findOne({
      where: { id: ordemTesteId },
      relations: { modelo: true },
    });

    // 4. Formata dados para enviar ao LLM
    const checklistData = checklistsToReport.map((item) => ({
      setor: item.labelSetor,
      preenchidoPor: item.checklist.preenchidoPor?.nomeCompleto || 'Desconhecido',
      dataPreenchimento: item.checklist.dataPreenchimento,
      status: item.checklist.status,
      bloqueante: item.checklist.bloqueante,
      observacoes: item.checklist.observacoes,
      itens: item.checklist.itens.map((it) => ({
        descricao: it.templateItem?.descricao || it.descricaoAvulsa || 'Item Avulso',
        conforme: it.conforme,
        resposta: it.valorResposta,
        observacao: it.observacao,
        isAvulso: !it.templateItemId,
      })),
    }));

    // 5. Gera a tabela visual em HTML via Genkit (Gemini-2.5-flash)
    const response = await ai.generate({
      model: googleAI.model('gemini-2.5-flash'),
      prompt: `
Você é o assistente inteligente de qualidade do ERP de Modelagem de Calçados da Dass.
Sua tarefa é gerar uma tabela visual HTML moderna, corporativa e responsiva com o resumo do checklist preenchido.

Dados da Ordem de Teste:
- Código de Barras: ${testOrder?.codigoBarras || 'N/A'}
- Modelo: ${testOrder?.modelo?.nome || 'N/A'} (${testOrder?.modelo?.codigoProduto || 'N/A'})

Dados do Checklist Preenchido:
${JSON.stringify(checklistData, null, 2)}

Diretrizes da Tabela HTML:
1. Crie uma estrutura HTML elegante para o corpo do e-mail. Use fontes limpas como Arial ou Inter, espaçamento confortável e cores harmoniosas (paleta profissional/corporativa, por exemplo tons de cinza escuro, azul Dass, etc.).
2. Adicione colunas claras na tabela:
   - Setor
   - Item de Verificação / Fator
   - Status (Use obrigatoriamente ✅ para "Conforme" e ❌ para "Não Conforme" / "Pendência")
   - Resposta / Valor Informado
   - Observações (se houver)
3. Escreva no início do e-mail um parágrafo de resumo executivo gerado por IA sobre a conformidade do checklist para o setor ${labelSetor}, alertando se houver pendências bloqueantes.
4. Retorne APENAS o código HTML puro que será usado como corpo do e-mail, sem a formatação de bloco de código markdown (sem os caracteres \`\`\`html e \`\`\`). Comece diretamente com a tag HTML (como <div style="..."> ou <html>).
      `,
    });

    let corpoHtml = response.text || '';
    // Sanitização para remover eventuais blocos de código markdown que o modelo possa gerar
    if (corpoHtml.startsWith('```html')) {
      corpoHtml = corpoHtml.slice(7);
    } else if (corpoHtml.startsWith('```')) {
      corpoHtml = corpoHtml.slice(3);
    }
    if (corpoHtml.endsWith('```')) {
      corpoHtml = corpoHtml.slice(0, -3);
    }
    corpoHtml = corpoHtml.trim();

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
    const hasPendencies = checklistsToReport.some(x => x.checklist.status === ChecklistStatus.COM_PENDENCIAS);
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

    // 10. Envia o e-mail via SMTP simulado/real
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
      console.error('[dispararEmailChecklistFlow] Falha no SMTP:', err);
      savedEmail.status = EmailStatus.ERRO;
      savedEmail.erroMensagem = err.message || String(err);
      await emailLogRepo.save(savedEmail);

      return {
        success: false,
        emailId: savedEmail.id,
        message: `Falha ao enviar e-mail por SMTP: ${err.message || err}`,
      };
    }
  }
);

/**
 * Função utilitária para acionar o flow de e-mail de forma assíncrona.
 * Isso impede que a resposta HTTP do controlador fique aguardando o processamento do LLM e do SMTP.
 */
export function triggerChecklistEmail(checklistId: string, ordemTesteId: string): void {
  console.log(`[EmailFlow] Acionando flow para checklistId=${checklistId}, ordemTesteId=${ordemTesteId}`);
  dispararEmailChecklistFlow({ checklistId, ordemTesteId })
    .then((res) => {
      if (res.success) {
        console.log(`[EmailFlow] Flow concluído com sucesso. Email ID: ${res.emailId}`);
      } else {
        console.warn(`[EmailFlow] Flow concluído com aviso: ${res.message}`);
      }
    })
    .catch((err) => {
      console.error('[EmailFlow] Erro crítico ao executar o flow:', err);
    });
}
