const historico = [
  { id: '1', setorId: 's1', tipoLote: 'CAIXA_TESTE', status: 'CONCLUIDO', dataEntrada: '2023-01-01' },
  { id: '2', setorId: 's1', tipoLote: 'LOTE_PRINCIPAL', status: 'EM_PROCESSO', dataEntrada: '2023-01-02' }
];

const agrupado = [];
for (const item of historico) {
  const existente = agrupado.find(a => a.setorId === item.setorId);
  if (existente) {
    existente.itens.push(item);
  } else {
    agrupado.push({ ...item, itens: [item] });
  }
}
console.log(agrupado);
