const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot está online!');
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor de keep-alive rodando na porta ' + listener.address().port);
});

module.exports = app;
