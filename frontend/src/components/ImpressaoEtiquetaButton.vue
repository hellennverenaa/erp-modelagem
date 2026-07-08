<!-- frontend/src/components/ImpressaoEtiquetaButton.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import api from '../api/axios'; 

const props = defineProps<{
  ordensSelecionadas: any[]; 
}>();

const isPrinting = ref(false);

const mapearOrdensParaDTO = (ordens: any[]) => {
  return ordens.map(ordem => ({
    codigoPeca: ordem.peca?.nome || 'PEÇA DE TESTE',
    tamanho: ordem.tamanho || 'U',
    quantidade: ordem.quantidadeLote || 1,
    modelo: ordem.modelo?.nome || 'MODELO DASS',
    versao: 'VAP',
    produtoDescricao: `${ordem.modelo?.codigoProduto || ''} ${ordem.modelo?.nome || ''}`,
    ordemTeste: ordem.codigoOrdem || '00000000',
    pacote: ordem.numeroPacote || '1',
    documento: ordem.documentoReferencia || 'PCP-DASS',
    semana: ordem.semanaCalendario || '00',
    material: ordem.composicaoMaterial || 'N/D',
    itens: ordem.gradeItens || 'N/A',
    talao: ordem.identificacaoTalao || '1x1',
    codigoBarras: `${ordem.codigoOrdem || '000000' }#${ordem.numeroPacote || '0'}#DASS`
  }));
};

const executarImpressaoSilenciosa = async () => {
  if (props.ordensSelecionadas.length === 0) return;
  
  isPrinting.value = true;
  try {
    const payloadDTO = mapearOrdensParaDTO(props.ordensSelecionadas);
    
    const response = await api.post('/etiquetas/imprimir', {
      etiquetas: payloadDTO
    }, {
      responseType: 'blob' 
    });

    const file = new Blob([response.data], { type: 'application/pdf' });
    const fileURL = URL.createObjectURL(file);

    // Injeção de Iframe oculto no sandboxing do DOM para bypass de preview
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.src = fileURL;
    document.body.appendChild(iframe);

    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    };

    // Garbage Collection preventivo contra estouro de heap no client-side
    setTimeout(() => {
      URL.revokeObjectURL(fileURL);
      document.body.removeChild(iframe);
    }, 30000);

  } catch (error) {
    console.error('[IMPRESSÃO_ETIQUETAS] Falha catastrofica no processador:', error);
  } finally {
    isPrinting.value = false;
  }
};
</script>

<template>
  <button 
    @click="executarImpressaoSilenciosa" 
    :disabled="isPrinting || ordensSelecionadas.length === 0"
    class="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-950 text-white font-medium text-xs rounded shadow-sm hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
  >
    <svg v-if="!isPrinting" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
    </svg>
    <svg v-else class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <span>{{ isPrinting ? 'Compilando Gabarito...' : 'Imprimir Etiquetas (A4)' }}</span>
  </button>
</template>