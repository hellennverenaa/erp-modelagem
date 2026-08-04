import { AppDataSource } from './src/config/database';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto'; // 🚀 O "remédio" para o erro do ID!

async function ligarTrator() {
    try {
        console.log('🚜 Ligando o Trator de Dados (V4 - O Definitivo)...');
        
        // 1. Conecta no banco
        await AppDataSource.initialize();
        console.log('✅ Banco conectado!');

        const csvPath = path.join(process.cwd(), 'Dados.csv');
        if (!fs.existsSync(csvPath)) {
            throw new Error(`🛑 ARQUIVO NÃO ENCONTRADO NO CAMINHO: ${csvPath}`);
        }

        const fileContent = fs.readFileSync(csvPath, 'utf-8');
        const linhas = fileContent.split(/\r?\n/);
        
        let inseridas = 0;
        console.log(`\n🔍 Arquivo encontrado! Lendo ${linhas.length} linhas...\n`);

        for (const linha of linhas) {
            if (!linha.trim()) continue;
            
            let colunas = linha.split(';');
            if (colunas.length < 3) {
                colunas = linha.split(',');
            }
            
            if (colunas.length >= 3) {
                // Pega exatamente a Coluna 3 (ex: "021BIQUEIRA")
                const dadoBruto = colunas[3].replace(/"/g, '').trim();
                const match = dadoBruto.match(/^(\d+)(.*)$/);
                
                if (match) {
                    const numero = match[1].trim(); // Extrai só o "021"
                    
                    // Pega a Coluna 5 (ex: "BIQUEIRA-1"), se não existir usa as letras da Coluna 3
                    let nome = '';
                    if (colunas.length > 4 && colunas[2].trim() !== '') {
                        nome = colunas[2].replace(/"/g, '').trim();
                    } else {
                        nome = match[3].trim();
                    }

                    // Força a criação de um ID para não depender do PostgreSQL
                    const id = randomUUID();

                    // Injeção perfeita com ID gerado na hora!
                    await AppDataSource.query(
                        `INSERT INTO erp_modelagem.catalogo_pecas (id, numero, nome) 
                         VALUES ($1, $2, $3) 
                         ON CONFLICT (numero) DO UPDATE SET nome = $3`,
                        [id, numero, nome]
                    );
                    
                    console.log(`✔️ Peça salva: ${numero} - ${nome}`);
                    inseridas++;
                }
            }
        }
        
        console.log(`\n🎉 TRATOR FINALIZOU: ${inseridas} peças foram socadas com sucesso no PostgreSQL!`);
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ O TRATOR BATEU NUM MURO DE ERRO:');
        console.error(error);
        process.exit(1);
    }
}

ligarTrator();