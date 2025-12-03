require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');

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

client.on('messageCreate', message => {
  if (!message.content.startsWith('.calc') || message.author.bot) return;

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
});

// Armazena conversas em andamento (por usuário)
const conversasIR = new Map();

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const content = message.content.trim();

  // --- 1) INÍCIO DO COMANDO .imposto-de-renda ---
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

  // --- 2) CONTINUAÇÃO DO FLUXO ---
  const conversa = conversasIR.get(message.author.id);
  if (!conversa) return;

  const resposta = message.content.trim();

  // Passo 1: dependentes
  if (conversa.passo === 1) {
    const dep = parseInt(resposta);

    if (isNaN(dep) || dep < 0) {
      return message.reply('❌ Digite um número válido de dependentes.');
    }

    conversa.dependentes = dep;
    conversa.passo = 2;

    return message.reply('💰 Quanto você pagou de **INSS no ano**? (A soma total em R$)');
  }

  // Passo 2: INSS
  if (conversa.passo === 2) {
    const inss = parseFloat(resposta);

    if (isNaN(inss) || inss < 0) {
      return message.reply('❌ Digite um valor válido de INSS.');
    }

    conversa.inss = inss;
    conversa.passo = 3;

    return message.reply('🧾 Tem **outras deduções**? (mensalidade escolar, saúde, etc). Se não tiver, responda 0.');
  }

  // Passo 3: outras deduções
  if (conversa.passo === 3) {
    const outras = parseFloat(resposta);

    if (isNaN(outras) || outras < 0) {
      return message.reply('❌ Digite um valor válido.');
    }

    conversa.outrasDeducoes = outras;

    // CALCULAR imposto
    const { renda, dependentes, inss, outrasDeducoes } = conversa;

    const deducaoDependentes = dependentes * 2275.08; // valor anual
    const base = renda - inss - outrasDeducoes - deducaoDependentes;

    let imposto = 0;

    function faixa(valor, aliq, deduzir) {
      return valor * aliq - deduzir;
    }

    if (base <= 22599.00) imposto = 0;
    else if (base <= 33919.80) imposto = faixa(base, 0.075, 1694.93);
    else if (base <= 45012.60) imposto = faixa(base, 0.15, 4231.88);
    else if (base <= 55976.16) imposto = faixa(base, 0.225, 7604.72);
    else imposto = faixa(base, 0.275, 10432.32);

    if (imposto < 0) imposto = 0;

    conversasIR.delete(message.author.id);

    return message.reply(
      `📊 **Cálculo do Imposto de Renda**\n` +
      `🧑‍💼 Renda anual: **R$ ${renda.toFixed(2)}**\n` +
      `👨‍👩‍👧 Dependentes: **${dependentes}**\n` +
      `🏦 INSS: **R$ ${inss.toFixed(2)}**\n` +
      `🧾 Outras deduções: **R$ ${outrasDeducoes.toFixed(2)}**\n\n` +
      `📉 Base de cálculo: **R$ ${base.toFixed(2)}**\n` +
      `💵 Imposto devido: **R$ ${imposto.toFixed(2)}**`
    );
  }
});


// Login do bot
client.login(process.env.DISCORD_TOKEN);
