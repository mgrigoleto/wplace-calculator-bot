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

// Login do bot
client.login(process.env.DISCORD_TOKEN);
