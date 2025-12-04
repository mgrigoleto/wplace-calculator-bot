require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const PDFDocument = require('pdfkit'); // Necessário para gerar o PDF

const app = express();
const PORT = process.env.PORT || 3000;

// Servidor web básico para keep-alive
// ATENÇÃO: Embora isso ajude a responder requisições HTTP,
// o Vercel não é ideal para hospedar um processo Discord bot 24/7.
app.get('/', (req, res) => {
    res.send('Bot está online e respondendo HTTP!');
});

app.listen(PORT, () => {
    console.log(`Servidor de keep-alive rodando na porta ${PORT}`);
});

// Criação do cliente Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
});

client.once('ready', () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
});

// ------------------------------------------------------------------
// COMANDO .calc (Funciona porque é simples e não usa I/O de disco)
// ------------------------------------------------------------------
client.on('messageCreate', message => {
    if (message.author.bot) return;

    if (message.content.startsWith('.calc')) {
        const args = message.content.split(' ');
        const n = parseFloat(args[1]);

        if (isNaN(n)) {
            message.reply('❌ Por favor, digite um número válido. Ex: `.calc 900`');
            return;
        }

        const totalHoras = (n * 30) / 3600;
        const horas = Math.floor(totalHoras);
        const minutos = Math.round((totalHoras - horas) * 60);
        const minutosFormatados = minutos.toString().padStart(2, '0');

        message.reply(`🕒 O tempo para carregar todos os seus pixels é **${horas}h:${minutosFormatados}m**`);
    }
});

// Armazena conversas em andamento (por usuário)
const conversasIR = new Map();

/**
 * Função para gerar o PDF do imposto de renda em memória (Buffer).
 * Isso resolve o problema de incompatibilidade com o File System do Vercel.
 * @param {object} conversa - Dados da conversa IR
 * @returns {Promise<Buffer>} - O Buffer do arquivo PDF
 */
function generatePdfBuffer(conversa) {
    return new Promise((resolve) => {
        const doc = new PDFDocument();
        const buffers = [];

        // Coleta os pedaços do PDF em um array de buffers
        doc.on('data', buffers.push.bind(buffers));

        // Quando o documento termina, concatena os buffers em um único Buffer
        doc.on('end', () => {
            const pdfBuffer = Buffer.concat(buffers);
            resolve(pdfBuffer);
        });

        // Extrai dados para o PDF
        const { renda, dependentes, inss, outrasDeducoes } = conversa;

        // ========================
        // CÁLCULO ANUAL (Lógica mantida do código original)
        // ========================

        const deducaoDependentesAnual = dependentes * 2275.08;
        const baseAnual = renda - inss - outrasDeducoes - deducaoDependentesAnual;

        let impostoAnual = 0;

        function faixa(valor, aliq, deduzir) {
            return valor * aliq - deduzir;
        }

        if (baseAnual <= 22599.00) impostoAnual = 0;
        else if (baseAnual <= 33919.80) impostoAnual = faixa(baseAnual, 0.075, 1694.93);
        else if (baseAnual <= 45012.60) impostoAnual = faixa(baseAnual, 0.15, 4231.88);
        else if (baseAnual <= 55976.16) impostoAnual = faixa(baseAnual, 0.225, 7604.72);
        else impostoAnual = faixa(baseAnual, 0.275, 10432.32);

        impostoAnual = Math.max(0, impostoAnual);

        // ========================
        // CÁLCULO MENSAL (IRRF REAL) (Lógica mantida do código original)
        // ========================
        const rendaMensal = renda / 12;
        const inssMensal = inss / 12;
        const outrasMensais = outrasDeducoes / 12;
        const deducaoDependentesMensal = dependentes * 189.59; // valor mensal

        const baseMensal = rendaMensal - inssMensal - outrasMensais - deducaoDependentesMensal;

        function calcularIRRFMensal(base) {
            if (base <= 2259.20) return 0;
            if (base <= 2826.65) return base * 0.075 - 169.44;
            if (base <= 3751.05) return base * 0.15 - 381.44;
            if (base <= 4664.68) return base * 0.225 - 662.77;
            return base * 0.275 - 896.00;
        }

        const irrfMensal = Math.max(0, calcularIRRFMensal(baseMensal));
        const meses = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];

        let textoIRRF = '';
        meses.forEach(m => {
            textoIRRF += `${m}: R$ ${irrfMensal.toFixed(2)}\n`;
        });

        // ===========================
        // GERAÇÃO DO CONTEÚDO DO PDF
        // ===========================

        doc.fontSize(20).text("Cálculo de Imposto de Renda", { underline: true });
        doc.moveDown();

        doc.fontSize(12);
        doc.text(`Renda anual: R$ ${renda.toFixed(2)}`);
        doc.text(`Dependentes: ${dependentes}`);
        doc.text(`INSS no ano: R$ ${inss.toFixed(2)}`);
        doc.text(`Outras deduções: R$ ${outrasDeducoes.toFixed(2)}`);
        doc.moveDown();

        doc.text(`Base anual: R$ ${baseAnual.toFixed(2)}`);
        doc.text(`Imposto devido anual: R$ ${impostoAnual.toFixed(2)}`);
        doc.moveDown();

        doc.fontSize(14).text("IRRF mensal:", { underline: true });
        doc.fontSize(12).text(textoIRRF);

        // Finaliza o documento, o que dispara o evento 'end' e resolve a Promise
        doc.end();
    });
}


client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const content = message.content.trim();

    // =====================================================
    //  INÍCIO DO COMANDO .imposto-de-renda
    // =====================================================
    if (content.startsWith('.imposto-de-renda')) {
        const args = content.split(' ');
        const rendaAnual = parseFloat(args[1]);

        if (isNaN(rendaAnual)) {
            return message.reply('❌ Informe sua renda anual. Exemplo: `.imposto-de-renda 85000`');
        }

        // Cria fluxo de perguntas
        conversasIR.set(message.author.id, {
            renda: rendaAnual,
            passo: 1,
            dependentes: 0,
            inss: 0,
            outrasDeducoes: 0
        });

        return message.reply('👨‍🏫 Quantos **dependentes** você tem? (Digite apenas o número)');
    }

    // Se o usuário estiver no fluxo:
    const conversa = conversasIR.get(message.author.id);
    if (!conversa) return;

    const resposta = message.content.trim();

    // =====================================================
    //  PASSO 1 — Dependentes
    // =====================================================
    if (conversa.passo === 1) {
        const dep = parseInt(resposta);
        if (isNaN(dep) || dep < 0)
            return message.reply('❌ Digite um número válido de dependentes.');

        conversa.dependentes = dep;
        conversa.passo = 2;

        return message.reply('💰 Quanto você pagou de **INSS no ano**? (A soma total em R$)');
    }

    // =====================================================
    //  PASSO 2 — INSS
    // =====================================================
    if (conversa.passo === 2) {
        const inss = parseFloat(resposta);
        if (isNaN(inss) || inss < 0)
            return message.reply('❌ Digite um valor válido de INSS.');

        conversa.inss = inss;
        conversa.passo = 3;

        return message.reply('🧾 Tem **outras deduções**? (educação, saúde, etc). Se não tiver, responda 0.');
    }

    // =====================================================
    //  PASSO 3 — Outras deduções
    // =====================================================
    if (conversa.passo === 3) {
        const outras = parseFloat(resposta);
        if (isNaN(outras) || outras < 0)
            return message.reply('❌ Digite um valor válido.');

        conversa.outrasDeducoes = outras;

        // Agora fecha o fluxo
        conversasIR.delete(message.author.id);

        try {
            // GERA O PDF EM MEMÓRIA (Buffer)
            const pdfBuffer = await generatePdfBuffer(conversa);

            // Responde com o Buffer do PDF
            message.reply({
                content: `📊 Aqui está seu cálculo de IR e IRRF mês a mês!`,
                files: [{ attachment: pdfBuffer, name: 'calculo_imposto_de_renda.pdf' }]
            });

        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
            message.reply('Houve um erro ao gerar o PDF. Tente novamente mais tarde.');
        }

        return;
    }
});


// Login do bot
client.login(process.env.DISCORD_TOKEN);