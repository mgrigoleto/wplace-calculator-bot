require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const PDFDocument = require('pdfkit');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Servidor web básico para keep-alive
app.get('/', (req, res) => {
    res.send('Bot está online!');
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

// Salva conversas do IR
const conversasIR = new Map();

// =========================
//   LISTENER ÚNICO
// =========================
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const args = content.split(' ');
    const comando = args[0].toLowerCase();

    // ======================================
    // .calc
    // ======================================
    if (comando === '.calc') {
        const n = parseFloat(args[1]);

        if (isNaN(n)) {
            return message.reply('❌ Por favor, digite um número válido. Ex: `.calc 900`');
        }

        const totalHoras = (n * 30) / 3600;
        const horas = Math.floor(totalHoras);
        const minutos = Math.round((totalHoras - horas) * 60);
        const minutosFormatados = minutos.toString().padStart(2, '0');

        return message.reply(`🕒 O tempo para carregar todos os seus pixels é **${horas}h:${minutosFormatados}m**`);
    }

    // ======================================
    // .imposto-de-renda (início do fluxo)
    // ======================================
    if (comando === '.imposto-de-renda') {
        const rendaAnual = parseFloat(args[1]);

        if (isNaN(rendaAnual)) {
            return message.reply('❌ Informe sua renda anual. Exemplo: `.imposto-de-renda 85000`');
        }

        conversasIR.set(message.author.id, {
            renda: rendaAnual,
            passo: 1,
            dependentes: 0,
            inss: 0,
            outrasDeducoes: 0
        });

        return message.reply('👨‍🏫 Quantos **dependentes** você tem? (Digite apenas o número)');
    }

    // ======================================
    // FLUXO DE PERGUNTAS DO IR
    // ======================================
    const conversa = conversasIR.get(message.author.id);
    if (!conversa) return;

    const resposta = content;

    // PASSO 1 — dependentes
    if (conversa.passo === 1) {
        const dep = parseInt(resposta);
        if (isNaN(dep) || dep < 0)
            return message.reply('❌ Digite um número válido de dependentes.');

        conversa.dependentes = dep;
        conversa.passo = 2;

        return message.reply('💰 Quanto você pagou de **INSS no ano**? (A soma total em R$)');
    }

    // PASSO 2 — INSS
    if (conversa.passo === 2) {
        const inss = parseFloat(resposta);
        if (isNaN(inss) || inss < 0)
            return message.reply('❌ Digite um valor válido de INSS.');

        conversa.inss = inss;
        conversa.passo = 3;

        return message.reply('🧾 Tem **outras deduções**? (educação, saúde, etc). Se não tiver, responda 0.');
    }

    // PASSO 3 — Outras deduções
    if (conversa.passo === 3) {
        const outras = parseFloat(resposta);
        if (isNaN(outras) || outras < 0)
            return message.reply('❌ Digite um valor válido.');

        conversa.outrasDeducoes = outras;

        // Fecha o fluxo
        conversasIR.delete(message.author.id);

        const { renda, dependentes, inss, outrasDeducoes } = conversa;

        // ==========================
        // CÁLCULOS
        // ==========================

        // --- Anual ---
        const dedDepend = dependentes * 2275.08;
        const baseAnual = renda - inss - outrasDeducoes - dedDepend;

        let impostoAnual = 0;
        function faixa(v, aliq, deduzir) {
            return v * aliq - deduzir;
        }

        if (baseAnual <= 22599.00) impostoAnual = 0;
        else if (baseAnual <= 33919.80) impostoAnual = faixa(baseAnual, 0.075, 1694.93);
        else if (baseAnual <= 45012.60) impostoAnual = faixa(baseAnual, 0.15, 4231.88);
        else if (baseAnual <= 55976.16) impostoAnual = faixa(baseAnual, 0.225, 7604.72);
        else impostoAnual = faixa(baseAnual, 0.275, 10432.32);

        impostoAnual = Math.max(0, impostoAnual);

        // --- Mensal (IRRF Real) ---
        const rendaMensal = renda / 12;
        const inssMensal = inss / 12;
        const outrasMensais = outrasDeducoes / 12;
        const dedDepMensal = dependentes * 189.59;

        const baseMensal = rendaMensal - inssMensal - outrasMensais - dedDepMensal;

        function irrf(base) {
            if (base <= 2259.20) return 0;
            if (base <= 2826.65) return base * 0.075 - 169.44;
            if (base <= 3751.05) return base * 0.15 - 381.44;
            if (base <= 4664.68) return base * 0.225 - 662.77;
            return base * 0.275 - 896.00;
        }

        const irrfMensal = Math.max(0, irrf(baseMensal));

        // ==========================
        // PDF
        // ==========================
        const nomeArquivo = `ir_${message.author.id}.pdf`;
        const doc = new PDFDocument();
        const stream = fs.createWriteStream(nomeArquivo);

        doc.pipe(stream);

        doc.fontSize(20).text("Cálculo de Imposto de Renda", { underline: true });
        doc.moveDown();

        doc.fontSize(12).text(`Renda anual: R$ ${renda.toFixed(2)}`);
        doc.text(`Dependentes: ${dependentes}`);
        doc.text(`INSS no ano: R$ ${inss.toFixed(2)}`);
        doc.text(`Outras deduções: R$ ${outrasDeducoes.toFixed(2)}`);
        doc.moveDown();

        doc.text(`Base anual: R$ ${baseAnual.toFixed(2)}`);
        doc.text(`Imposto devido anual: R$ ${impostoAnual.toFixed(2)}`);
        doc.moveDown();

        doc.fontSize(14).text("IRRF mensal:", { underline: true });
        doc.fontSize(12).text(
            Array(12)
                .fill(0)
                .map((_, i) =>
                    `${[
                        'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                        'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
                    ][i]}: R$ ${irrfMensal.toFixed(2)}`
                )
                .join("\n")
        );

        doc.end();

        stream.on('finish', () => {
            message.reply({
                content: `📊 Aqui está seu cálculo de IR + IRRF mês a mês!`,
                files: [nomeArquivo]
            }).then(() => fs.unlinkSync(nomeArquivo));
        });

        return;
    }
});

// Login do bot
client.login(process.env.DISCORD_TOKEN);